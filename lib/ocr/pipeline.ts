import { extractTextFromImage, batchOCR, validateOCRResult } from './vision'
import { structureOCRText, batchStructure, chunkStructuredData } from './structure'
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
    
    // OCR 결과 검증
    const validResults = ocrResults.filter((result, idx) => {
      const isValid = validateOCRResult(result)
      if (!isValid) {
        console.warn(`Page ${idx + 1} failed validation, skipping...`)
      }
      return isValid
    })
    
    console.log(`OCR completed: ${validResults.length}/${imageBuffers.length} pages valid`)
    
    // Step 2: Gemini로 구조화
    console.log('Structuring text with Gemini...')
    const structuredData = await batchStructure(
      validResults.map((result, idx) => ({
        text: result.text,
        pageNumber: idx + 1
      }))
    )
    
    console.log(`Structured ${structuredData.length} pages`)
    
    // Step 3: 청크로 분할
    console.log('Creating chunks...')
    const allChunks = structuredData.flatMap(structured => 
      chunkStructuredData(structured, documentId)
    )
    
    console.log(`Created ${allChunks.length} chunks`)
    
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
      pagesProcessed: validResults.length,
      chunksCreated: savedCount,
    }
  } catch (error) {
    console.error('Pipeline error:', error)
    throw error
  }
}

/**
 * 단일 페이지 빠른 처리 (테스트용)
 */
export async function processPage(
  imageBuffer: Buffer,
  documentId: string,
  pageNumber: number
): Promise<number> {
  const supabase = getServiceSupabase()
  
  // OCR
  const ocrResult = await extractTextFromImage(imageBuffer)
  
  if (!validateOCRResult(ocrResult)) {
    throw new Error('OCR result validation failed')
  }
  
  // 구조화
  const structured = await structureOCRText(ocrResult.text, pageNumber)
  
  // 청크 생성
  const chunks = chunkStructuredData(structured, documentId)
  
  // 임베딩 및 저장
  let savedCount = 0
  for (const chunk of chunks) {
    const embedding = await embedText(chunk.content)
    
    const { error } = await supabase
      .from('knowledge_chunks')
      .insert({
        ...chunk,
        embedding: embedding,
      })
    
    if (!error) {
      savedCount++
    }
  }
  
  return savedCount
}
