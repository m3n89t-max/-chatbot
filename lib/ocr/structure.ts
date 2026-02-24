import { GoogleGenerativeAI } from '@google/generative-ai'
import { StructuredOCROutput, Rule, Exception } from '@/lib/types'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/**
 * OCR로 추출한 텍스트를 Gemini로 구조화
 */
export async function structureOCRText(
  rawText: string,
  pageNumber: number
): Promise<StructuredOCROutput> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `
You are analyzing a page from Glenn Neely's NEoWave educational material.

Extract and structure the following information from the text:
1. Section title
2. Rules (fundamental trading rules)
3. Exceptions (special cases or conditions)
4. Definitions (key terms)

Raw OCR Text:
${rawText}

Return a JSON object with this structure:
{
  "section": "section title",
  "rules": [
    {
      "text": "rule description",
      "type": "rule"
    }
  ],
  "exceptions": [
    {
      "text": "exception description",
      "applies_to": "which rule this applies to"
    }
  ]
}

Only extract information that is clearly stated. If something is unclear, omit it.
`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response')
    }
    
    const structured: StructuredOCROutput = JSON.parse(jsonMatch[0])
    
    // 소스 페이지 번호 추가
    structured.rules = structured.rules.map(rule => ({
      ...rule,
      source_page: pageNumber
    }))
    
    structured.exceptions = structured.exceptions.map(exception => ({
      ...exception,
      source_page: pageNumber
    }))
    
    return structured
  } catch (error) {
    console.error('Gemini structuring error:', error)
    throw new Error(`Failed to structure OCR text: ${error}`)
  }
}

/**
 * 여러 페이지를 배치로 구조화
 */
export async function batchStructure(
  ocrTexts: { text: string; pageNumber: number }[]
): Promise<StructuredOCROutput[]> {
  const results: StructuredOCROutput[] = []
  
  // 순차 처리 (Gemini API rate limit 고려)
  for (const { text, pageNumber } of ocrTexts) {
    try {
      const structured = await structureOCRText(text, pageNumber)
      results.push(structured)
      
      // Rate limit 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Failed to structure page ${pageNumber}:`, error)
      // 실패한 페이지는 스킵하고 계속 진행
    }
  }
  
  return results
}

/**
 * 구조화된 데이터를 청크로 분할
 */
export function chunkStructuredData(
  structured: StructuredOCROutput,
  documentId: string
): Array<{
  document_id: string
  chunk_type: 'rule' | 'exception' | 'definition'
  section_title: string
  content: string
  source_page: number
}> {
  const chunks: Array<any> = []
  
  // Rules를 개별 청크로 변환
  for (const rule of structured.rules) {
    chunks.push({
      document_id: documentId,
      chunk_type: rule.type as 'rule' | 'exception' | 'definition',
      section_title: structured.section,
      content: rule.text,
      source_page: rule.source_page || 0,
    })
  }
  
  // Exceptions를 개별 청크로 변환
  for (const exception of structured.exceptions) {
    chunks.push({
      document_id: documentId,
      chunk_type: 'exception',
      section_title: structured.section,
      content: `${exception.text} (Applies to: ${exception.applies_to})`,
      source_page: exception.source_page || 0,
    })
  }
  
  return chunks
}
