import OpenAI from 'openai'
import { GPTOutput } from '@/lib/types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * ChatGPT Primary Wave Count 분석
 * 보수적 카운팅, 규칙 위반 탐지, 명확한 무효화 제시
 */
export async function analyzePrimaryCount(
  query: string,
  ragContext: string,
  symbol: string = 'BTCUSDT',
  timeframe: string = '4H'
): Promise<GPTOutput> {
  // 트레이딩 키워드 감지
  const tradingKeywords = [
    '분석', '매수', '매도', 'long', 'short', '파동', 'wave', '추세', 'trend',
    '지지', '저항', 'btc', 'eth', 'usdt', '코인', '차트', '임펄스', '조정',
    '돌파', 'breakout', '손절', '진입', '청산', 'impulse', 'correction',
    '캔들', 'rsi', 'macd', '이평선', '가격', 'price', '포지션', 'position',
    '비트', '이더', '리플', '상승', '하락', '매매', '투자'
  ]
  
  const lowerQuery = query.toLowerCase()
  const isTradingQuery = tradingKeywords.some(keyword => 
    lowerQuery.includes(keyword.toLowerCase())
  )

  // 일반 대화용 프롬프트
  if (!isTradingQuery) {
    const systemPrompt = `
당신은 친근하고 자연스러운 대화를 하는 AI입니다.
반말로 편하게 대화하세요.

하지만 응답은 반드시 JSON 형식으로 제공해야 합니다:
{
  "direction": "HOLD",
  "scenario_label": "일반 대화",
  "confirmation_trigger": "해당 없음",
  "invalidation_level": "해당 없음",
  "risk_reward_estimate": 0,
  "rule_citations": ["일반 대화"],
  "explanation": "자연스러운 대화 응답 (2-3문장)"
}
`

    const userPrompt = `
사용자 질문: ${query}

위 JSON 형식으로 자연스럽게 답변하세요. explanation 필드에 친근한 대화를 작성하세요.
`

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' },
      })

      const content = completion.choices[0].message.content
      if (!content) {
        throw new Error('Empty response from GPT')
      }

      const output: GPTOutput = JSON.parse(content)
      validateGPTOutput(output)
      return output
    } catch (error) {
      console.error('ChatGPT general chat error:', error)
      throw new Error(`General chat failed: ${error}`)
    }
  }

  // 트레이딩 분석용 프롬프트
  const systemPrompt = `
당신은 Glenn Neely의 NEoWave 전문가입니다.
PRIMARY WAVE COUNT를 보수적으로 분석하는 역할입니다.

Guidelines:
1. NEoWave 규칙을 엄격하게 따름
2. 불확실하면 HOLD 추천
3. 명확한 무효화 레벨 제시
4. 자연스럽고 친근한 한국어로 설명 (딱딱한 분석 X)
5. 반말 사용 가능, 편안한 톤

${ragContext}
`

  const userPrompt = `
분석 요청: ${symbol} (${timeframe})
질문: ${query}

JSON 응답 (한국어로 자연스럽게):
{
  "direction": "LONG | SHORT | HOLD",
  "scenario_label": "시나리오 한줄 요약 (친근하게)",
  "confirmation_trigger": "어떤 신호가 나오면 확정인지 (자연스럽게 설명)",
  "invalidation_level": "무효화 가격 (쉽게 설명)",
  "risk_reward_estimate": 0.0,
  "rule_citations": ["적용된 규칙들"],
  "explanation": "분석 설명 (친구에게 설명하듯 자연스럽게, 2-3문장)"
}
`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // 보수적
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0].message.content
    if (!content) {
      throw new Error('Empty response from GPT')
    }

    const output: GPTOutput = JSON.parse(content)
    
    // 유효성 검증
    validateGPTOutput(output)
    
    return output
  } catch (error) {
    console.error('ChatGPT analysis error:', error)
    throw new Error(`Primary count analysis failed: ${error}`)
  }
}

/**
 * Streaming 버전
 */
export async function analyzePrimaryCountStream(
  query: string,
  ragContext: string,
  symbol: string = 'BTCUSDT',
  timeframe: string = '4H',
  onChunk: (chunk: string) => void
): Promise<GPTOutput> {
  const systemPrompt = `
You are a NEoWave expert trained by Glenn Neely.
Your role is PRIMARY WAVE COUNT analysis with a CONSERVATIVE approach.

${ragContext}
`

  const userPrompt = `
Analyze: ${symbol} (${timeframe})
${query}

Provide JSON:
{
  "direction": "LONG|SHORT|HOLD",
  "scenario_label": "",
  "confirmation_trigger": "",
  "invalidation_level": "",
  "risk_reward_estimate": 0,
  "rule_citations": []
}
`

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      stream: true,
    })

    let fullContent = ''

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      fullContent += content
      onChunk(content)
    }

    const output: GPTOutput = JSON.parse(fullContent)
    validateGPTOutput(output)
    
    return output
  } catch (error) {
    console.error('ChatGPT streaming error:', error)
    throw new Error(`Primary count streaming failed: ${error}`)
  }
}

/**
 * GPT 출력 유효성 검증
 */
function validateGPTOutput(output: GPTOutput): void {
  const requiredFields = [
    'direction',
    'scenario_label',
    'confirmation_trigger',
    'invalidation_level',
    'risk_reward_estimate',
    'rule_citations',
  ]

  for (const field of requiredFields) {
    if (!(field in output)) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  // Direction 검증
  if (!['LONG', 'SHORT', 'HOLD'].includes(output.direction)) {
    throw new Error(`Invalid direction: ${output.direction}`)
  }

  // Risk/Reward 검증
  if (typeof output.risk_reward_estimate !== 'number') {
    throw new Error('risk_reward_estimate must be a number')
  }

  // Rule citations 검증
  if (!Array.isArray(output.rule_citations)) {
    throw new Error('rule_citations must be an array')
  }
}

/**
 * 대화형 분석 (이전 컨텍스트 포함)
 */
export async function analyzeWithContext(
  query: string,
  ragContext: string,
  previousMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  symbol: string = 'BTCUSDT',
  timeframe: string = '4H'
): Promise<GPTOutput> {
  const systemPrompt = `
You are a NEoWave expert. Continue the conversation while maintaining conservative analysis.

${ragContext}
`

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...previousMessages,
    {
      role: 'user',
      content: `${query}\n\nProvide JSON response with the standard GPTOutput structure.`,
    },
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0].message.content
    if (!content) {
      throw new Error('Empty response from GPT')
    }

    const output: GPTOutput = JSON.parse(content)
    validateGPTOutput(output)
    
    return output
  } catch (error) {
    console.error('ChatGPT context analysis error:', error)
    throw new Error(`Context analysis failed: ${error}`)
  }
}
