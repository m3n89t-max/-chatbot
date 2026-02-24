import { GoogleGenerativeAI } from '@google/generative-ai'
import { GeminiAltOutput } from '@/lib/types'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/**
 * Gemini Alternative Count 분석
 * GPT와 다른 관점 시도, 대안 시나리오 구성
 */
export async function analyzeAlternativeCount(
  query: string,
  ragContext: string,
  gptOutput: any, // GPT의 primary count
  symbol: string = 'BTCUSDT',
  timeframe: string = '4H'
): Promise<GeminiAltOutput> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  // GPT가 일반 대화로 답했는지 확인
  const isGeneralChat = gptOutput.scenario_label === "일반 대화"

  let prompt = ''

  if (isGeneralChat) {
    // 일반 대화일 때는 GPT와 다른 스타일로 답변
    prompt = `
당신은 친근하고 유머러스한 AI입니다.
GPT가 다음과 같이 답했습니다:
${JSON.stringify(gptOutput, null, 2)}

사용자 질문: ${query}

당신은 GPT와 **다른 스타일**로 답하세요:
- GPT보다 더 유머러스하게
- 또는 더 자세하게
- 또는 다른 각도에서 접근

JSON 응답:
{
  "direction": "HOLD",
  "scenario_label": "일반 대화",
  "confirmation_trigger": "해당 없음",
  "invalidation_level": "해당 없음",
  "risk_reward_estimate": 0,
  "rule_citations": ["일반 대화"],
  "alternative_reasoning": "GPT와 다른 스타일로 답변 (친구에게 말하듯, 2-3문장)"
}
`
  } else {
    // 트레이딩 분석일 때는 논쟁 모드
    prompt = `
당신은 NEoWave 전문가로서 ALTERNATIVE WAVE COUNT를 제시하는 역할입니다.
GPT의 보수적 분석에 CHALLENGE하고 DEBATE하세요!

GPT의 Primary Count:
${JSON.stringify(gptOutput, null, 2)}

당신의 임무:
1. **GPT의 약점 찾기** - 너무 보수적이거나 놓친 부분
2. **대안 주장** - 다른 관점을 과감하게 제시
3. **논쟁** - 왜 당신 관점이 더 나은지 설득
4. NEoWave 규칙은 따르되, 다르게 해석
5. 더 공격적이고 적극적인 시각 (무모하진 않게)
6. **자연스러운 한국어로** 친근하게 설명 (딱딱한 문체 X)

${ragContext}

질문: ${query}
Symbol: ${symbol}
Timeframe: ${timeframe}

JSON 응답 (한국어로 자연스럽게):
{
  "direction": "LONG | SHORT | HOLD",
  "scenario_label": "대안 시나리오 한줄 (친근하게)",
  "confirmation_trigger": "확인 신호 (쉽게 설명)",
  "invalidation_level": "무효화 가격",
  "risk_reward_estimate": 0.0,
  "rule_citations": ["적용 규칙"],
  "alternative_reasoning": "**GPT와 왜 다른지 직설적으로 설명** - 친구에게 말하듯 자연스럽게. GPT가 놓친 점이나 너무 조심스러운 부분 지적하고, 당신 관점이 왜 더 나은지 2-3문장으로"
}

기억해:
- GPT의 보수성에 도전
- 대안을 당당하게 주장
- 과감하되 규칙은 지킴
- **반말 사용 가능, 편안한 톤**
`
  }

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    console.log('Gemini raw response:', text.substring(0, 500)) // 디버깅용
    
    // JSON 추출 시도 (여러 패턴)
    let jsonMatch = text.match(/\{[\s\S]*\}/)
    
    // 코드 블록 안에 있을 수 있음
    if (!jsonMatch) {
      jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        jsonMatch[0] = jsonMatch[1]
      }
    }
    
    // 아예 JSON이 없으면 기본 응답 생성
    if (!jsonMatch) {
      console.warn('No JSON found in Gemini response, using fallback')
      return {
        direction: 'HOLD',
        scenario_label: isGeneralChat ? '일반 대화' : '분석 보류',
        confirmation_trigger: '해당 없음',
        invalidation_level: '해당 없음',
        risk_reward_estimate: 0,
        rule_citations: [isGeneralChat ? '일반 대화' : '데이터 부족'],
        alternative_reasoning: text.substring(0, 200) + '...' || '응답 생성 실패',
      }
    }
    
    const output: GeminiAltOutput = JSON.parse(jsonMatch[0])
    
    // 유효성 검증
    validateGeminiOutput(output)
    
    return output
  } catch (error) {
    console.error('Gemini alternative analysis error:', error)
    
    // 에러 발생 시 기본 응답 반환 (시스템 중단 방지)
    return {
      direction: 'HOLD',
      scenario_label: isGeneralChat ? '일반 대화' : '분석 오류',
      confirmation_trigger: '해당 없음',
      invalidation_level: '해당 없음',
      risk_reward_estimate: 0,
      rule_citations: [isGeneralChat ? '일반 대화' : 'Gemini 오류'],
      alternative_reasoning: isGeneralChat 
        ? '지금은 답변하기 어려워요. 다시 한번 물어봐줄래?' 
        : 'Gemini 분석 중 오류가 발생했어요. GPT 분석을 참고해주세요.',
    }
  }
}

/**
 * Streaming 버전
 */
export async function analyzeAlternativeCountStream(
  query: string,
  ragContext: string,
  gptOutput: any,
  symbol: string,
  timeframe: string,
  onChunk: (chunk: string) => void
): Promise<GeminiAltOutput> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `
Alternative NEoWave analysis for ${symbol} (${timeframe}).

Primary count: ${JSON.stringify(gptOutput)}

${ragContext}

Query: ${query}

Provide alternative JSON analysis with: direction, scenario_label, confirmation_trigger, invalidation_level, risk_reward_estimate, rule_citations, alternative_reasoning.
`

  try {
    const result = await model.generateContentStream(prompt)
    
    let fullText = ''
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text()
      fullText += chunkText
      onChunk(chunkText)
    }
    
    // JSON 추출
    const jsonMatch = fullText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini stream')
    }
    
    const output: GeminiAltOutput = JSON.parse(jsonMatch[0])
    validateGeminiOutput(output)
    
    return output
  } catch (error) {
    console.error('Gemini streaming error:', error)
    throw new Error(`Alternative count streaming failed: ${error}`)
  }
}

/**
 * Gemini 출력 유효성 검증
 */
function validateGeminiOutput(output: GeminiAltOutput): void {
  const requiredFields = [
    'direction',
    'scenario_label',
    'confirmation_trigger',
    'invalidation_level',
    'risk_reward_estimate',
    'rule_citations',
    'alternative_reasoning',
  ]

  for (const field of requiredFields) {
    if (!(field in output)) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  if (!['LONG', 'SHORT', 'HOLD'].includes(output.direction)) {
    throw new Error(`Invalid direction: ${output.direction}`)
  }

  if (typeof output.risk_reward_estimate !== 'number') {
    throw new Error('risk_reward_estimate must be a number')
  }

  if (!Array.isArray(output.rule_citations)) {
    throw new Error('rule_citations must be an array')
  }

  if (typeof output.alternative_reasoning !== 'string') {
    throw new Error('alternative_reasoning must be a string')
  }
}

/**
 * Gemini로 빠른 규칙 체크
 */
export async function quickRuleCheck(
  scenario: any,
  ragContext: string
): Promise<{ isValid: boolean; violations: string[] }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `
Check if this trading scenario violates any NEoWave rules:

${JSON.stringify(scenario, null, 2)}

Rules context:
${ragContext}

Respond with JSON:
{
  "isValid": true/false,
  "violations": ["violation 1", "violation 2", ...]
}
`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON')
    }
    
    return JSON.parse(jsonMatch[0])
  } catch (error) {
    console.error('Rule check error:', error)
    return { isValid: false, violations: ['Rule check failed'] }
  }
}
