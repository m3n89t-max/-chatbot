import { extractTextFromImage, batchOCR, validateOCRResult, isOCRInsufficientForStructuring } from './vision'
import { structureOCRText, batchStructure, chunkStructuredData } from './structure'
import { describeImageForRAG } from './vision-description'
import { getServiceSupabase } from '@/lib/supabase'
import { embedText } from '@/lib/rag/embeddings'

/**
 * 전체 OCR 파이프라인 실행
 * PNG → OCR → Structure → Chunk → Embed → DB 저장
 */
export async function processDocument(
  documentId: string,
  imageBuffers: Buffer[]
): Promise<{
  pagesProcessed: number
  chunksCreated: number
}> {
  const supabase = getServiceSupabase()
  
  try {
    // Step 1: OCR 처리
    console.log(`Starting OCR for ${imageBuffers.length} pages...`)
    const ocrResults = await batchOCR(imageBuffers)

    const validPairs = ocrResults
      .map((result, idx) => ({ result, pageIndex: idx }))
      .filter(({ result }) => validateOCRResult(result))
    const invalidIndices = ocrResults
      .map((result, idx) => ({ result, idx }))
      .filter(({ result }) => isOCRInsufficientForStructuring(result))
      .map(({ idx }) => idx)

    console.log(`OCR completed: ${validPairs.length}/${imageBuffers.length} pages valid, ${invalidIndices.length} fallback to Vision`)

    // Step 2a: 텍스트 충분한 페이지 → Gemini로 텍스트 구조화
    let textChunks: Array<{ document_id: string; chunk_type: 'rule' | 'exception' | 'definition'; section_title: string; content: string; source_page: number }> = []
    if (validPairs.length > 0) {
      console.log('Structuring text with Gemini...')
      const structuredData = await batchStructure(
        validPairs.map(({ result, pageIndex }) => ({
          text: result.text,
          pageNumber: pageIndex + 1,
        }))
      )
      textChunks = structuredData.flatMap(structured =>
        chunkStructuredData(structured, documentId)
      )
    }

    // Step 2b: OCR 부족한 페이지(그래프·차트 등) → Gemini Vision 이미지 설명
    let visionChunks: Array<{ document_id: string; chunk_type: 'rule' | 'exception' | 'definition'; section_title: string; content: string; source_page: number }> = []
    for (const pageIndex of invalidIndices) {
      try {
        console.log(`Vision fallback for page ${pageIndex + 1}...`)
        const structured = await describeImageForRAG(imageBuffers[pageIndex], pageIndex + 1)
        visionChunks = visionChunks.concat(chunkStructuredData(structured, documentId))
        await new Promise(resolve => setTimeout(resolve, 800))
      } catch (err) {
        console.error(`Vision fallback failed for page ${pageIndex + 1}:`, err)
      }
    }

    const allChunks = textChunks.concat(visionChunks)
    console.log(`Created ${allChunks.length} chunks (${textChunks.length} from text, ${visionChunks.length} from vision)`)
    
    // Step 4: 임베딩 생성 및 DB 저장
    console.log('Generating embeddings and saving to database...')
    let savedCount = 0
    
    for (const chunk of allChunks) {
      try {
        // 임베딩 생성
        const embedding = await embedText(chunk.content)
        
        // DB에 저장
        const { error } = await supabase
          .from('knowledge_chunks')
          .insert({
            ...chunk,
            embedding: embedding,
          })
        
        if (error) {
          console.error('Failed to save chunk:', error)
        } else {
          savedCount++
        }
        
        // Rate limit 방지
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        console.error('Failed to process chunk:', error)
      }
    }
    
    console.log(`Pipeline complete: ${savedCount} chunks saved`)

    return {
      pagesProcessed: validPairs.length + invalidIndices.length,
      chunksCreated: savedCount,
    }
  } catch (error) {
    console.error('Pipeline error:', error)
    throw error
  }
}

/**
 * 단일 페이지 빠른 처리 (테스트용). OCR 부족 시 Vision 폴백.
 */
export async function processPage(
  imageBuffer: Buffer,
  documentId: string,
  pageNumber: number
): Promise<number> {
  const supabase = getServiceSupabase()

  const ocrResult = await extractTextFromImage(imageBuffer)
  let chunks: Array<{ document_id: string; chunk_type: 'rule' | 'exception' | 'definition'; section_title: string; content: string; source_page: number }>

  if (validateOCRResult(ocrResult)) {
    const structured = await structureOCRText(ocrResult.text, pageNumber)
    chunks = chunkStructuredData(structured, documentId)
  } else {
    const structured = await describeImageForRAG(imageBuffer, pageNumber)
    chunks = chunkStructuredData(structured, documentId)
  }

  let savedCount = 0
  for (const chunk of chunks) {
    const embedding = await embedText(chunk.content)
    const { error } = await supabase
      .from('knowledge_chunks')
      .insert({
        ...chunk,
        embedding: embedding,
      })
    if (!error) savedCount++
  }
  return savedCount
}
