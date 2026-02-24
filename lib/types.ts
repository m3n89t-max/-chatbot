// ============================================
// 데이터베이스 타입 정의
// ============================================

export interface Document {
  id: string
  title: string
  source_type: 'png' | 'pdf'
  created_at: string
}

export interface DocumentPage {
  id: string
  document_id: string
  page_no: number
  image_path: string
}

export interface KnowledgeChunk {
  id: string
  document_id: string
  chunk_type: 'rule' | 'exception' | 'definition'
  section_title: string
  content: string
  embedding?: number[]
  source_page: number
}

export interface Conversation {
  id: string
  user_id: string
  created_at: string
}

export interface Run {
  id: string
  conversation_id: string
  user_query: string
  gpt_output: GPTOutput
  gemini_alt: GeminiAltOutput
  final_decision: FinalDecision
  created_at: string
}

// ============================================
// AI 모델 출력 타입
// ============================================

export interface GPTOutput {
  direction: 'LONG' | 'SHORT' | 'HOLD'
  scenario_label: string
  confirmation_trigger: string
  invalidation_level: string
  risk_reward_estimate: number
  rule_citations: string[]
  explanation?: string // 자연스러운 한국어 설명 추가
}

export interface GeminiAltOutput {
  direction: 'LONG' | 'SHORT' | 'HOLD'
  scenario_label: string
  confirmation_trigger: string
  invalidation_level: string
  risk_reward_estimate: number
  rule_citations: string[]
  alternative_reasoning: string
}

export interface JudgeScore {
  scenario: 'gpt' | 'gemini'
  rule_validity: boolean
  invalidation_clarity: number // 0-2
  risk_reward: number // 0-2
  structure_simplicity: number // 0-2
  resolution_speed: number // 0-2
  total_score: number
  stop_distance?: number
}

export interface FinalDecision {
  symbol: string
  timeframe: string
  decision: 'LONG' | 'SHORT' | 'HOLD'
  entry_trigger: string
  invalidation: string
  risk_percent: number
  alternate_scenario: string
  state: TradingState
  selected_scenario: 'gpt' | 'gemini'
  judge_scores: {
    gpt: JudgeScore
    gemini: JudgeScore
  }
  reasoning: string
}

// ============================================
// 상태머신 타입
// ============================================

export type TradingState = 
  | 'WAITING'
  | 'BREAKOUT_WATCH'
  | 'CONFIRMED_IMPULSE'
  | 'CONFIRMED_CORRECTION'
  | 'INVALIDATED_RESET'

export interface StateTransition {
  current_state: TradingState
  next_state: TradingState
  trigger_condition: string
  reset_condition: string
}

// ============================================
// RAG 관련 타입
// ============================================

export interface RAGContext {
  chunks: KnowledgeChunk[]
  similarity_scores: number[]
  total_retrieved: number
}

export interface EmbeddingRequest {
  text: string
  model?: string
}

export interface EmbeddingResponse {
  embedding: number[]
  model: string
}

// ============================================
// OCR 관련 타입
// ============================================

export interface OCRResult {
  text: string
  confidence: number
  bounding_boxes?: BoundingBox[]
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface StructuredOCROutput {
  section: string
  rules: Rule[]
  exceptions: Exception[]
}

export interface Rule {
  text: string
  type: 'rule' | 'exception' | 'definition'
  source_page?: number
}

export interface Exception {
  text: string
  applies_to: string
  source_page?: number
}

// ============================================
// API 요청/응답 타입
// ============================================

export interface ChatRequest {
  query: string
  conversation_id?: string
  symbol?: string
  timeframe?: string
}

export interface ChatResponse {
  final_decision: FinalDecision
  gpt_output: GPTOutput
  gemini_alt: GeminiAltOutput
  rag_context: RAGContext
  run_id: string
}

export interface UploadRequest {
  file: File
  title: string
  source_type: 'png' | 'pdf'
}

export interface UploadResponse {
  document_id: string
  pages_processed: number
  chunks_created: number
}

// ============================================
// 리스크 관리 타입
// ============================================

export interface RiskConfig {
  max_risk_percent: number
  max_concurrent_positions: number
  consecutive_loss_threshold: number
}

export interface PositionState {
  active_positions: number
  consecutive_losses: number
  is_trading_enabled: boolean
}
