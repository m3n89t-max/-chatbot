import { GPTOutput, GeminiAltOutput, JudgeScore, FinalDecision, TradingState } from '@/lib/types'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/**
 * 공격형 점수화 알고리즘
 * GPT vs Gemini 시나리오 비교 및 최종 선택
 */
export async function judgeScenarios(
  gptOutput: GPTOutput,
  geminiOutput: GeminiAltOutput,
  ragContext: string,
  symbol: string,
  timeframe: string,
  currentState: TradingState = 'WAITING'
): Promise<FinalDecision> {
  // 일반 대화인지 확인
  const isGeneralChat = gptOutput.scenario_label === "일반 대화"

  if (isGeneralChat) {
    // 일반 대화일 때는 간단하게 판정
    const randomChoice = Math.random() > 0.5 ? 'gpt' : 'gemini'
    const selectedOutput = randomChoice === 'gpt' ? gptOutput : geminiOutput
    
    return {
      symbol,
      timeframe,
      decision: 'HOLD',
      entry_trigger: '해당 없음',
      invalidation: '해당 없음',
      risk_percent: 0,
      alternate_scenario: randomChoice === 'gpt' ? geminiOutput.scenario_label : gptOutput.scenario_label,
      state: 'WAITING',
      selected_scenario: randomChoice,
      judge_scores: {
        gpt: { scenario: 'gpt', rule_validity: true, invalidation_clarity: 0, risk_reward: 0, structure_simplicity: 0, resolution_speed: 0, total_score: 0 },
        gemini: { scenario: 'gemini', rule_validity: true, invalidation_clarity: 0, risk_reward: 0, structure_simplicity: 0, resolution_speed: 0, total_score: 0 },
      },
      reasoning: randomChoice === 'gpt' 
        ? `ChatGPT 선택! ${gptOutput.explanation || '간결하고 명확한 답변이야.'}` 
        : `Gemini 선택! ${geminiOutput.alternative_reasoning || '더 친근하고 재미있는 답변이야!'}`,
    }
  }

  // 트레이딩 분석일 때는 정상 판정
  // Step 1: 각 시나리오 점수화
  const gptScore = await scoreScenario('gpt', gptOutput, ragContext)
  const geminiScore = await scoreScenario('gemini', geminiOutput, ragContext)

  // Step 2: 선택 규칙 적용
  const selectedScenario = selectBestScenario(gptScore, geminiScore)
  const selectedOutput = selectedScenario === 'gpt' ? gptOutput : geminiOutput

  // Step 3: 상태머신 전이
  const nextState = determineNextState(currentState, selectedOutput)

  // Step 4: 최종 결정 생성
  const finalDecision: FinalDecision = {
    symbol,
    timeframe,
    decision: selectedOutput.direction,
    entry_trigger: selectedOutput.confirmation_trigger,
    invalidation: selectedOutput.invalidation_level,
    risk_percent: calculateRiskPercent(selectedOutput.risk_reward_estimate),
    alternate_scenario: selectedScenario === 'gpt' 
      ? geminiOutput.scenario_label 
      : gptOutput.scenario_label,
    state: nextState,
    selected_scenario: selectedScenario,
    judge_scores: {
      gpt: gptScore,
      gemini: geminiScore,
    },
    reasoning: generateReasoning(gptScore, geminiScore, selectedScenario),
  }

  return finalDecision
}

/**
 * 개별 시나리오 점수화
 */
async function scoreScenario(
  scenario: 'gpt' | 'gemini',
  output: GPTOutput | GeminiAltOutput,
  ragContext: string
): Promise<JudgeScore> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `
You are a strict NEoWave rule validator.

Evaluate this trading scenario against NEoWave rules:

${JSON.stringify(output, null, 2)}

Rules context:
${ragContext}

Score each criterion (0-2 points each):

1. **Rule Validity** (Pass/Fail): Does this violate any NEoWave rules?
2. **Invalidation Clarity** (0-2): How clear and specific is the invalidation level?
3. **Risk Reward** (0-2): Quality of risk/reward ratio (2R+ = 2pts, 1.5-2R = 1pt, <1.5R = 0pt)
4. **Structure Simplicity** (0-2): How simple and clear is the wave structure?
5. **Resolution Speed** (0-2): How soon will this scenario be confirmed or invalidated?

Also estimate the stop distance in percentage terms.

Respond with JSON:
{
  "rule_validity": true/false,
  "invalidation_clarity": 0-2,
  "risk_reward": 0-2,
  "structure_simplicity": 0-2,
  "resolution_speed": 0-2,
  "stop_distance": 0.0
}
`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from judge response')
    }

    const scores = JSON.parse(jsonMatch[0])

    // 총점 계산
    const totalScore = scores.rule_validity
      ? scores.invalidation_clarity +
        scores.risk_reward +
        scores.structure_simplicity +
        scores.resolution_speed
      : 0 // 규칙 위반 시 0점

    return {
      scenario,
      rule_validity: scores.rule_validity,
      invalidation_clarity: scores.invalidation_clarity,
      risk_reward: scores.risk_reward,
      structure_simplicity: scores.structure_simplicity,
      resolution_speed: scores.resolution_speed,
      total_score: totalScore,
      stop_distance: scores.stop_distance,
    }
  } catch (error) {
    console.error('Scoring error:', error)
    // 기본 점수 (보수적)
    return {
      scenario,
      rule_validity: true,
      invalidation_clarity: 1,
      risk_reward: 1,
      structure_simplicity: 1,
      resolution_speed: 1,
      total_score: 4,
      stop_distance: 2.0,
    }
  }
}

/**
 * 최적 시나리오 선택
 */
function selectBestScenario(
  gptScore: JudgeScore,
  geminiScore: JudgeScore
): 'gpt' | 'gemini' {
  // 규칙 1: 규칙 위반 시 즉시 탈락
  if (!gptScore.rule_validity && !geminiScore.rule_validity) {
    // 둘 다 위반 - 더 보수적인 GPT 선택
    return 'gpt'
  }

  if (!gptScore.rule_validity) return 'gemini'
  if (!geminiScore.rule_validity) return 'gpt'

  // 규칙 2: 점수 차이가 2점 이상이면 높은 점수 선택
  const scoreDiff = Math.abs(gptScore.total_score - geminiScore.total_score)

  if (scoreDiff >= 2) {
    return gptScore.total_score > geminiScore.total_score ? 'gpt' : 'gemini'
  }

  // 규칙 3: 점수 비슷하면 stop distance가 작은 것 선택 (공격형)
  const gptStop = gptScore.stop_distance || 999
  const geminiStop = geminiScore.stop_distance || 999

  return gptStop <= geminiStop ? 'gpt' : 'gemini'
}

/**
 * 리스크 비율 계산
 */
function calculateRiskPercent(riskReward: number): number {
  // 기본 리스크: 1-2%
  // R/R이 높을수록 조금 더 공격적
  if (riskReward >= 3) return 2
  if (riskReward >= 2) return 1.5
  return 1
}

/**
 * 상태머신 전이 결정
 */
function determineNextState(
  currentState: TradingState,
  output: GPTOutput | GeminiAltOutput
): TradingState {
  // HOLD 판정 시 WAITING으로
  if (output.direction === 'HOLD') {
    return 'WAITING'
  }

  // 상태 전이 로직
  switch (currentState) {
    case 'WAITING':
      // 진입 신호 대기 중
      return 'BREAKOUT_WATCH'

    case 'BREAKOUT_WATCH':
      // 돌파 확인 시 임펄스/조정 확인
      if (output.scenario_label.toLowerCase().includes('impulse')) {
        return 'CONFIRMED_IMPULSE'
      }
      if (output.scenario_label.toLowerCase().includes('correction')) {
        return 'CONFIRMED_CORRECTION'
      }
      return 'BREAKOUT_WATCH'

    case 'CONFIRMED_IMPULSE':
    case 'CONFIRMED_CORRECTION':
      // 이미 확정된 상태 유지
      return currentState

    case 'INVALIDATED_RESET':
      // 무효화 후 리셋 → WAITING으로
      return 'WAITING'

    default:
      return 'WAITING'
  }
}

/**
 * 판정 근거 생성 (자연스러운 한국어)
 */
function generateReasoning(
  gptScore: JudgeScore,
  geminiScore: JudgeScore,
  selected: 'gpt' | 'gemini'
): string {
  const selectedScore = selected === 'gpt' ? gptScore : geminiScore
  const otherScore = selected === 'gpt' ? geminiScore : gptScore
  const selectedName = selected === 'gpt' ? 'ChatGPT' : 'Gemini'
  const otherName = selected === 'gpt' ? 'Gemini' : 'ChatGPT'

  let reasoning = `**${selectedName} 선택!** `

  // 규칙 위반 체크
  if (!otherScore.rule_validity) {
    reasoning += `${otherName}는 NEoWave 규칙 위반이 있었어. `
  }

  // 점수 비교 (친근하게)
  reasoning += `점수는 ${selectedScore.total_score}/8 vs ${otherScore.total_score}/8이야. `

  // 강점 분석 (자연스럽게)
  const strengths: string[] = []
  if (selectedScore.invalidation_clarity === 2) strengths.push('무효화 조건이 명확함')
  if (selectedScore.risk_reward === 2) strengths.push('리스크/보상비 훌륭함')
  if (selectedScore.structure_simplicity === 2) strengths.push('구조가 심플함')
  if (selectedScore.resolution_speed === 2) strengths.push('빠른 결론 가능')

  if (strengths.length > 0) {
    reasoning += `강점: ${strengths.join(', ')}. `
  }

  // Stop distance (쉽게)
  reasoning += `손절 거리는 ${selectedScore.stop_distance?.toFixed(2)}% 정도야.`

  return reasoning
}

/**
 * 리스크 관리 체크
 */
export function checkRiskManagement(
  decision: FinalDecision,
  activePositions: number,
  consecutiveLosses: number
): { allowed: boolean; reason?: string } {
  const maxPositions = parseInt(process.env.MAX_CONCURRENT_POSITIONS || '3')
  const maxLosses = parseInt(process.env.CONSECUTIVE_LOSS_THRESHOLD || '3')

  // 포지션 수 제한
  if (activePositions >= maxPositions) {
    return {
      allowed: false,
      reason: `Maximum concurrent positions (${maxPositions}) reached`,
    }
  }

  // 연속 손실 제한
  if (consecutiveLosses >= maxLosses) {
    return {
      allowed: false,
      reason: `${maxLosses} consecutive losses - system paused`,
    }
  }

  // R/R 최소 기준
  const minRR = 1.5
  const gptRR = decision.judge_scores.gpt.risk_reward
  const geminiRR = decision.judge_scores.gemini.risk_reward

  if (gptRR < minRR && geminiRR < minRR) {
    return {
      allowed: false,
      reason: `Risk/Reward below minimum threshold (${minRR})`,
    }
  }

  return { allowed: true }
}
