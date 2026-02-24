import { TradingState, StateTransition } from '@/lib/types'

/**
 * 상태머신 관리
 */
export class TradingStateMachine {
  private currentState: TradingState = 'WAITING'
  private history: Array<{ state: TradingState; timestamp: Date }> = []

  constructor(initialState: TradingState = 'WAITING') {
    this.currentState = initialState
    this.history.push({ state: initialState, timestamp: new Date() })
  }

  /**
   * 현재 상태 반환
   */
  getState(): TradingState {
    return this.currentState
  }

  /**
   * 상태 전이
   */
  transition(nextState: TradingState, trigger: string): void {
    console.log(`State transition: ${this.currentState} -> ${nextState} (${trigger})`)
    
    this.currentState = nextState
    this.history.push({ state: nextState, timestamp: new Date() })
  }

  /**
   * 상태 리셋
   */
  reset(): void {
    this.transition('WAITING', 'Manual reset')
  }

  /**
   * 무효화 처리
   */
  invalidate(): void {
    this.transition('INVALIDATED_RESET', 'Invalidation level hit')
    
    // 일정 시간 후 WAITING으로 자동 전이
    setTimeout(() => {
      if (this.currentState === 'INVALIDATED_RESET') {
        this.transition('WAITING', 'Auto-recovery from invalidation')
      }
    }, 5000) // 5초 후
  }

  /**
   * 가능한 다음 상태들
   */
  getPossibleTransitions(): TradingState[] {
    switch (this.currentState) {
      case 'WAITING':
        return ['BREAKOUT_WATCH', 'INVALIDATED_RESET']
      
      case 'BREAKOUT_WATCH':
        return ['CONFIRMED_IMPULSE', 'CONFIRMED_CORRECTION', 'WAITING', 'INVALIDATED_RESET']
      
      case 'CONFIRMED_IMPULSE':
      case 'CONFIRMED_CORRECTION':
        return ['WAITING', 'INVALIDATED_RESET']
      
      case 'INVALIDATED_RESET':
        return ['WAITING']
      
      default:
        return ['WAITING']
    }
  }

  /**
   * 전이 가능 여부
   */
  canTransition(nextState: TradingState): boolean {
    return this.getPossibleTransitions().includes(nextState)
  }

  /**
   * 상태 히스토리 반환
   */
  getHistory(): Array<{ state: TradingState; timestamp: Date }> {
    return [...this.history]
  }

  /**
   * 현재 상태 지속 시간
   */
  getStateDuration(): number {
    if (this.history.length === 0) return 0
    
    const lastTransition = this.history[this.history.length - 1]
    return Date.now() - lastTransition.timestamp.getTime()
  }

  /**
   * 상태 설명
   */
  getStateDescription(): string {
    const descriptions: Record<TradingState, string> = {
      WAITING: '진입 기회 대기 중',
      BREAKOUT_WATCH: '돌파 관찰 중 - 진입 준비',
      CONFIRMED_IMPULSE: '임펄스 파동 확정 - 트렌드 진행 중',
      CONFIRMED_CORRECTION: '조정 파동 확정 - 되돌림 진행 중',
      INVALIDATED_RESET: '무효화 - 재평가 필요',
    }
    
    return descriptions[this.currentState] || '알 수 없는 상태'
  }
}

/**
 * 전이 규칙 정의
 */
export const transitionRules: Record<TradingState, StateTransition[]> = {
  WAITING: [
    {
      current_state: 'WAITING',
      next_state: 'BREAKOUT_WATCH',
      trigger_condition: 'Clear wave structure identified with entry setup',
      reset_condition: 'Structure becomes unclear or violated',
    },
  ],
  
  BREAKOUT_WATCH: [
    {
      current_state: 'BREAKOUT_WATCH',
      next_state: 'CONFIRMED_IMPULSE',
      trigger_condition: 'Breakout confirmed with impulse characteristics',
      reset_condition: 'Price returns below invalidation level',
    },
    {
      current_state: 'BREAKOUT_WATCH',
      next_state: 'CONFIRMED_CORRECTION',
      trigger_condition: 'Correction pattern confirmed',
      reset_condition: 'Pattern invalidated',
    },
    {
      current_state: 'BREAKOUT_WATCH',
      next_state: 'WAITING',
      trigger_condition: 'Setup expires without confirmation',
      reset_condition: 'N/A',
    },
  ],
  
  CONFIRMED_IMPULSE: [
    {
      current_state: 'CONFIRMED_IMPULSE',
      next_state: 'WAITING',
      trigger_condition: 'Wave target reached or position closed',
      reset_condition: 'N/A',
    },
    {
      current_state: 'CONFIRMED_IMPULSE',
      next_state: 'INVALIDATED_RESET',
      trigger_condition: 'Invalidation level breached',
      reset_condition: 'Price returns above invalidation',
    },
  ],
  
  CONFIRMED_CORRECTION: [
    {
      current_state: 'CONFIRMED_CORRECTION',
      next_state: 'WAITING',
      trigger_condition: 'Correction complete or position closed',
      reset_condition: 'N/A',
    },
    {
      current_state: 'CONFIRMED_CORRECTION',
      next_state: 'INVALIDATED_RESET',
      trigger_condition: 'Correction invalidated',
      reset_condition: 'Price recovers',
    },
  ],
  
  INVALIDATED_RESET: [
    {
      current_state: 'INVALIDATED_RESET',
      next_state: 'WAITING',
      trigger_condition: 'Cool-down period complete, ready for re-analysis',
      reset_condition: 'N/A',
    },
  ],
}

/**
 * 상태머신 DB 저장
 */
export async function saveStateMachine(
  supabase: any,
  conversationId: string,
  symbol: string,
  timeframe: string,
  state: TradingState,
  stateData: any
): Promise<void> {
  const { error } = await supabase
    .from('trading_states')
    .upsert({
      conversation_id: conversationId,
      symbol,
      timeframe,
      current_state: state,
      state_data: stateData,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'conversation_id,symbol,timeframe'
    })

  if (error) {
    console.error('Failed to save state machine:', error)
    throw error
  }
}

/**
 * 상태머신 DB 로드
 */
export async function loadStateMachine(
  supabase: any,
  conversationId: string,
  symbol: string,
  timeframe: string
): Promise<TradingStateMachine | null> {
  const { data, error } = await supabase
    .from('trading_states')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .single()

  if (error || !data) {
    return null
  }

  const machine = new TradingStateMachine(data.current_state as TradingState)
  return machine
}
