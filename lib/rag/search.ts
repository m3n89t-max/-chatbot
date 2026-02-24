import { getServiceSupabase } from '@/lib/supabase'
import { embedQuery } from './embeddings'
import { KnowledgeChunk, RAGContext } from '@/lib/types'

/**
 * RAG 검색 파라미터
 */
export interface SearchParams {
  query: string
  topK?: number
  matchThreshold?: number
  chunkType?: 'rule' | 'exception' | 'definition'
  documentId?: string
}

/**
 * Vector Similarity Search를 통한 RAG 검색
 */
export async function searchKnowledge(
  params: SearchParams
): Promise<RAGContext> {
  const {
    query,
    topK = 8,
    matchThreshold = 0.7,
    chunkType,
    documentId,
  } = params
  
  const supabase = getServiceSupabase()
  
  try {
    // 1. 쿼리 임베딩 생성
    const queryEmbedding = await embedQuery(query)
    
    // 2. RPC 함수로 유사도 검색
    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: topK * 2, // 필터링 여유분
    })
    
    if (error) {
      throw error
    }
    
    let chunks = data || []
    
    // 3. 추가 필터링
    if (chunkType) {
      chunks = chunks.filter((chunk: any) => chunk.chunk_type === chunkType)
    }
    
    if (documentId) {
      chunks = chunks.filter((chunk: any) => chunk.document_id === documentId)
    }
    
    // 4. Top-K 제한
    chunks = chunks.slice(0, topK)
    
    // 5. 결과 포맷팅
    const knowledgeChunks: KnowledgeChunk[] = chunks.map((chunk: any) => ({
      id: chunk.id,
      document_id: chunk.document_id,
      chunk_type: chunk.chunk_type,
      section_title: chunk.section_title,
      content: chunk.content,
      source_page: chunk.source_page,
    }))
    
    const similarityScores = chunks.map((chunk: any) => chunk.similarity)
    
    return {
      chunks: knowledgeChunks,
      similarity_scores: similarityScores,
      total_retrieved: knowledgeChunks.length,
    }
  } catch (error) {
    console.error('RAG search error:', error)
    throw new Error(`Knowledge search failed: ${error}`)
  }
}

/**
 * 우선순위 기반 검색
 * rule > exception > definition 순서로 가중치 부여
 */
export async function prioritySearch(
  query: string,
  topK: number = 8
): Promise<RAGContext> {
  const supabase = getServiceSupabase()
  const queryEmbedding = await embedQuery(query)
  
  // 각 타입별로 검색
  const [rules, exceptions, definitions] = await Promise.all([
    searchKnowledge({ query, topK: topK / 2, chunkType: 'rule' }),
    searchKnowledge({ query, topK: topK / 4, chunkType: 'exception' }),
    searchKnowledge({ query, topK: topK / 4, chunkType: 'definition' }),
  ])
  
  // 우선순위에 따라 결합
  const allChunks = [
    ...rules.chunks,
    ...exceptions.chunks,
    ...definitions.chunks,
  ]
  
  const allScores = [
    ...rules.similarity_scores,
    ...exceptions.similarity_scores,
    ...definitions.similarity_scores,
  ]
  
  return {
    chunks: allChunks.slice(0, topK),
    similarity_scores: allScores.slice(0, topK),
    total_retrieved: allChunks.length,
  }
}

/**
 * 동일 문서 가중치 검색
 * 같은 문서의 청크들을 우선적으로 가져옴
 */
export async function documentWeightedSearch(
  query: string,
  preferredDocumentId?: string,
  topK: number = 8
): Promise<RAGContext> {
  // 일반 검색 수행
  const generalResults = await searchKnowledge({ query, topK: topK * 2 })
  
  if (!preferredDocumentId) {
    return {
      chunks: generalResults.chunks.slice(0, topK),
      similarity_scores: generalResults.similarity_scores.slice(0, topK),
      total_retrieved: generalResults.chunks.length,
    }
  }
  
  // 선호 문서의 청크와 나머지 청크 분리
  const preferredChunks: KnowledgeChunk[] = []
  const preferredScores: number[] = []
  const otherChunks: KnowledgeChunk[] = []
  const otherScores: number[] = []
  
  generalResults.chunks.forEach((chunk, idx) => {
    if (chunk.document_id === preferredDocumentId) {
      preferredChunks.push(chunk)
      preferredScores.push(generalResults.similarity_scores[idx])
    } else {
      otherChunks.push(chunk)
      otherScores.push(generalResults.similarity_scores[idx])
    }
  })
  
  // 선호 문서를 우선 배치
  const resultChunks = [
    ...preferredChunks,
    ...otherChunks,
  ].slice(0, topK)
  
  const resultScores = [
    ...preferredScores,
    ...otherScores,
  ].slice(0, topK)
  
  return {
    chunks: resultChunks,
    similarity_scores: resultScores,
    total_retrieved: resultChunks.length,
  }
}

/**
 * RAG 컨텍스트를 프롬프트 형식으로 변환
 */
export function formatRAGContext(context: RAGContext): string {
  if (context.chunks.length === 0) {
    return '[No relevant Neely rules found]'
  }
  
  let formatted = '[Neely Rules Context]\n\n'
  
  context.chunks.forEach((chunk, idx) => {
    const score = context.similarity_scores[idx]
    const scorePercent = (score * 100).toFixed(1)
    
    formatted += `## ${chunk.section_title} (Page ${chunk.source_page}, ${chunk.chunk_type})\n`
    formatted += `Relevance: ${scorePercent}%\n`
    formatted += `${chunk.content}\n\n`
  })
  
  return formatted
}

/**
 * 하이브리드 검색 (키워드 + 벡터)
 */
export async function hybridSearch(
  query: string,
  topK: number = 8
): Promise<RAGContext> {
  const supabase = getServiceSupabase()
  
  // 벡터 검색
  const vectorResults = await searchKnowledge({ query, topK })
  
  // 키워드 검색 (Full Text Search)
  const { data: keywordData } = await supabase
    .from('knowledge_chunks')
    .select('*')
    .textSearch('content', query)
    .limit(topK)
  
  // 중복 제거 및 결합
  const combinedChunks = new Map<string, KnowledgeChunk>()
  const scores = new Map<string, number>()
  
  vectorResults.chunks.forEach((chunk, idx) => {
    combinedChunks.set(chunk.id, chunk)
    scores.set(chunk.id, vectorResults.similarity_scores[idx])
  })
  
  if (keywordData) {
    keywordData.forEach(chunk => {
      if (!combinedChunks.has(chunk.id)) {
        combinedChunks.set(chunk.id, chunk)
        scores.set(chunk.id, 0.5) // 키워드 매치 기본 점수
      }
    })
  }
  
  // 점수 순으로 정렬
  const sortedEntries = Array.from(combinedChunks.entries())
    .sort((a, b) => (scores.get(b[0]) || 0) - (scores.get(a[0]) || 0))
    .slice(0, topK)
  
  return {
    chunks: sortedEntries.map(([_, chunk]) => chunk),
    similarity_scores: sortedEntries.map(([id, _]) => scores.get(id) || 0),
    total_retrieved: sortedEntries.length,
  }
}
