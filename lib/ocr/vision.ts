import vision from '@google-cloud/vision'
import { OCRResult } from '@/lib/types'

const client = new vision.ImageAnnotatorClient({
  credentials: process.env.GOOGLE_CLOUD_VISION_API_KEY 
    ? JSON.parse(process.env.GOOGLE_CLOUD_VISION_API_KEY)
    : undefined
})

/**
 * PNG/PDF 이미지에서 텍스트 추출 (Google Cloud Vision API)
 */
export async function extractTextFromImage(
  imageBuffer: Buffer
): Promise<OCRResult> {
  try {
    const [result] = await client.textDetection(imageBuffer)
    const detections = result.textAnnotations

    if (!detections || detections.length === 0) {
      return {
        text: '',
        confidence: 0,
      }
    }

    // 첫 번째 항목은 전체 텍스트
    const fullText = detections[0].description || ''
    
    // 바운딩 박스 정보 추출
    const boundingBoxes = detections.slice(1).map(detection => {
      const vertices = detection.boundingPoly?.vertices || []
      if (vertices.length < 2) return null
      
      return {
        x: vertices[0].x || 0,
        y: vertices[0].y || 0,
        width: (vertices[1].x || 0) - (vertices[0].x || 0),
        height: (vertices[2].y || 0) - (vertices[0].y || 0),
      }
    }).filter(box => box !== null)

    // 신뢰도 계산 (평균)
    const confidences = detections.slice(1).map(d => d.confidence || 0)
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0

    return {
      text: fullText,
      confidence: avgConfidence,
      bounding_boxes: boundingBoxes as any,
    }
  } catch (error) {
    console.error('OCR error:', error)
    throw new Error(`OCR processing failed: ${error}`)
  }
}

/**
 * 여러 페이지를 배치로 OCR 처리
 */
export async function batchOCR(
  imageBuffers: Buffer[]
): Promise<OCRResult[]> {
  const results: OCRResult[] = []
  
  // 병렬 처리 (최대 5개씩)
  const batchSize = 5
  for (let i = 0; i < imageBuffers.length; i += batchSize) {
    const batch = imageBuffers.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(buffer => extractTextFromImage(buffer))
    )
    results.push(...batchResults)
  }
  
  return results
}

/**
 * OCR 결과 품질 검증
 */
export function validateOCRResult(result: OCRResult): boolean {
  // 최소 신뢰도 체크
  if (result.confidence < 0.7) {
    return false
  }
  
  // 최소 텍스트 길이 체크
  if (result.text.length < 50) {
    return false
  }
  
  // 특수문자 비율 체크 (너무 많으면 노이즈일 가능성)
  const specialCharRatio = (result.text.match(/[^a-zA-Z0-9\s]/g) || []).length / result.text.length
  if (specialCharRatio > 0.5) {
    return false
  }
  
  return true
}
