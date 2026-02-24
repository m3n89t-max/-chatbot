import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * 텍스트를 OpenAI Embedding으로 변환
 * 모델: text-embedding-ada-002 (1536 차원)
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    })
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Embedding error:', error)
    throw new Error(`Failed to generate embedding: ${error}`)
  }
}

/**
 * 여러 텍스트를 배치로 임베딩
 */
export async function batchEmbed(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: texts,
    })
    
    return response.data.map(item => item.embedding)
  } catch (error) {
    console.error('Batch embedding error:', error)
    throw new Error(`Failed to generate batch embeddings: ${error}`)
  }
}

/**
 * 쿼리 임베딩 생성 (검색용)
 */
export async function embedQuery(query: string): Promise<number[]> {
  // 쿼리를 최적화하여 임베딩
  const optimizedQuery = optimizeQuery(query)
  return embedText(optimizedQuery)
}

/**
 * 검색 쿼리 최적화
 */
function optimizeQuery(query: string): string {
  // 불필요한 문자 제거
  let optimized = query.trim()
  
  // 특수 문자 정리
  optimized = optimized.replace(/[^\w\s가-힣]/g, ' ')
  
  // 중복 공백 제거
  optimized = optimized.replace(/\s+/g, ' ')
  
  return optimized
}
