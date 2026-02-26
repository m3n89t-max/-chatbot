import { GoogleGenerativeAI } from '@google/generative-ai'
import { StructuredOCROutput } from '@/lib/types'
import { GEMINI_MODEL } from '@/lib/models/gemini'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/**
 * OCR 결과가 부족한 이미지(그래프·차트 등)를 Gemini Vision으로 분석해
 * NEoWave/트레이딩 관점의 구조화된 설명을 반환합니다.
 * RAG 청크로 저장할 수 있도록 StructuredOCROutput 형식을 사용합니다.
 */
export async function describeImageForRAG(
  imageBuffer: Buffer,
  pageNumber: number
): Promise<StructuredOCROutput> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const base64 = imageBuffer.toString('base64')

  const prompt = `이 이미지는 Glenn Neely의 NEoWave 또는 트레이딩/파동 관련 교육 자료일 수 있습니다.
차트, 그래프, 파동 다이어그램, 규칙 설명 등이 포함되어 있을 수 있습니다.

이미지를 보고 다음을 한국어로 분석해 주세요:
1. section: 이 이미지/페이지의 제목 또는 주제 (한 줄)
2. rules: 이미지에서 읽을 수 있는 트레이딩/파동 규칙이 있으면 배열로 (없으면 빈 배열)
3. exceptions: 예외 조건이나 특수 케이스가 있으면 배열로 (없으면 빈 배열)

규칙이나 예외가 명확하지 않으면, 이미지 내용(차트 설명, 추세, 구간, 레이블 등)을 rules에 "이미지 설명: ..." 형태로 한 개 넣어 주세요.

반드시 아래 JSON만 출력하세요 (다른 텍스트 없이):
{
  "section": "섹션 제목",
  "rules": [
    { "text": "규칙 또는 이미지 설명 내용", "type": "rule" }
  ],
  "exceptions": [
    { "text": "예외 설명", "applies_to": "해당 규칙" }
  ]
}`

  const imagePart = {
    inlineData: {
      data: base64,
      mimeType: 'image/png',
    },
  }

  try {
    const result = await model.generateContent([prompt, imagePart])
    const response = result.response
    const text = response.text()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return fallbackStructuredOutput(pageNumber, text || '이미지 설명을 추출하지 못했습니다.')
    }

    const parsed = JSON.parse(jsonMatch[0]) as StructuredOCROutput

    if (!parsed.section) parsed.section = `이미지 설명 (페이지 ${pageNumber})`
    parsed.rules = (parsed.rules || []).map(r => ({
      ...r,
      source_page: pageNumber,
    }))
    parsed.exceptions = (parsed.exceptions || []).map(e => ({
      ...e,
      source_page: pageNumber,
    }))

    return parsed
  } catch (error) {
    console.error('Vision describeImageForRAG error:', error)
    return fallbackStructuredOutput(pageNumber, `이미지 분석 실패: ${error}`)
  }
}

function fallbackStructuredOutput(pageNumber: number, description: string): StructuredOCROutput {
  return {
    section: `이미지 설명 (페이지 ${pageNumber})`,
    rules: [{ text: description, type: 'definition', source_page: pageNumber }],
    exceptions: [],
  }
}
