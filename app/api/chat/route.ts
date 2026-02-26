import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { searchKnowledge, formatRAGContext } from '@/lib/rag'
import { analyzePrimaryCount } from '@/lib/models/chatgpt'
import { analyzeAlternativeCount } from '@/lib/models/gemini'
import { judgeScenarios, checkRiskManagement } from '@/lib/judge'
import { TradingStateMachine, saveStateMachine, loadStateMachine } from '@/lib/state-machine'
import { v4 as uuidv4 } from 'uuid'

/**
 * POST /api/chat
 * 멀티모델 분석 및 판단
 */
const CHAT_REQUIRED_ENV = [
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

export async function POST(request: NextRequest) {
  try {
    // 환경 변수 누락 시 HTML 500 대신 JSON으로 안내 (이때 발생하는 "Unexpected token '<'" 방지)
    const missingEnv = CHAT_REQUIRED_ENV.filter(key => !process.env[key])
    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          error: `환경 변수가 설정되지 않았습니다: ${missingEnv.join(', ')}. env-template.txt를 복사해 .env.local을 만들고 API 키를 채운 뒤 서버를 다시 실행하세요.`,
        },
        { status: 500 }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch (e) {
      console.error('Chat API: request body parse failed', e)
      return NextResponse.json(
        { error: '요청 본문이 너무 크거나 형식이 올바르지 않습니다. 이미지 수를 줄이거나 해상도를 낮춰 보세요.' },
        { status: 413 }
      )
    }

    const { query, conversation_id, symbol = 'BTCUSDT', timeframe = '4H', user_id, image, images } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Missing required field: query' },
        { status: 400 }
      )
    }

    // 단일 이미지(하위 호환) 또는 다중 이미지
    const imageList = Array.isArray(images) && images.length > 0
      ? images
      : image ? [{ dataUrl: image, label: undefined }] : []

    let enhancedQuery = query
    if (imageList.length > 0) {
      const labels = imageList.map((img: { label?: string }, i: number) => img.label || `이미지 ${i + 1}`).filter(Boolean)
      const labelText = labels.length > 0
        ? ` (${labels.join(', ')} 등)`
        : ''
      enhancedQuery = `[사용자가 차트 이미지 ${imageList.length}장을 첨부했습니다${labelText}]\n\n중기·단기 관점이 모두 반영된 다중 시간봉 분석을 요청합니다. 단타 위주로 진입/무효화를 제시해주세요.\n\n${query}\n\n각 이미지(시간봉)를 참고하여 분석해주세요.`
      console.log('Images attached to query:', imageList.length, labels.length ? labels : '')
    }

    const supabase = getServiceSupabase()

    // 1. 대화 세션 생성 또는 가져오기
    let convId = conversation_id
    if (!convId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user_id || 'anonymous',
          title: query.substring(0, 50),
        })
        .select()
        .single()

      if (convError || !newConv) {
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        )
      }

      convId = newConv.id
    }

    // 2. RAG 검색
    console.log('Performing RAG search...')
    const ragContext = await searchKnowledge({
      query,
      topK: 8,
      matchThreshold: 0.7,
    })

    const formattedContext = formatRAGContext(ragContext)
    console.log(`Retrieved ${ragContext.total_retrieved} knowledge chunks`)

    // 3. 상태머신 로드
    let stateMachine = await loadStateMachine(supabase, convId, symbol, timeframe)
    if (!stateMachine) {
      stateMachine = new TradingStateMachine('WAITING')
    }
    const currentState = stateMachine.getState()

    // 4. ChatGPT 분석 (Primary Count)
    console.log('Analyzing with ChatGPT...')
    const gptOutput = await analyzePrimaryCount(
      enhancedQuery, // 이미지 정보가 포함된 쿼리 사용
      formattedContext,
      symbol,
      timeframe
    )

    // 5. Gemini 분석 (Alternative Count) - 모든 질문에 호출
    console.log('Analyzing with Gemini...')
    const geminiOutput = await analyzeAlternativeCount(
      enhancedQuery, // 이미지 정보가 포함된 쿼리 사용
      formattedContext,
      gptOutput,
      symbol,
      timeframe
    )

    // 6. Judge 판정
    console.log('Judging scenarios...')
    const finalDecision = await judgeScenarios(
      gptOutput,
      geminiOutput,
      formattedContext,
      symbol,
      timeframe,
      currentState
    )

    // 7. 리스크 관리 체크
    const { data: riskData } = await supabase
      .from('risk_tracking')
      .select('*')
      .eq('user_id', user_id || 'anonymous')
      .single()

    const riskCheck = checkRiskManagement(
      finalDecision,
      riskData?.active_positions || 0,
      riskData?.consecutive_losses || 0
    )

    if (!riskCheck.allowed) {
      console.log('Risk management blocked trade:', riskCheck.reason)
      finalDecision.decision = 'HOLD'
      finalDecision.reasoning += ` [Risk Override: ${riskCheck.reason}]`
    }

    // 8. Run 저장
    const runId = uuidv4()
    const { error: runError } = await supabase
      .from('runs')
      .insert({
        id: runId,
        conversation_id: convId,
        user_query: query,
        gpt_output: gptOutput,
        gemini_alt: geminiOutput,
        final_decision: finalDecision,
        rag_context: {
          chunks: ragContext.chunks.map(c => ({
            content: c.content,
            source_page: c.source_page,
            section_title: c.section_title,
          })),
          total_retrieved: ragContext.total_retrieved,
        },
      })

    if (runError) {
      console.error('Failed to save run:', runError)
    }

    // 9. 상태머신 업데이트 및 저장
    stateMachine.transition(finalDecision.state, 'AI analysis result')
    await saveStateMachine(
      supabase,
      convId,
      symbol,
      timeframe,
      finalDecision.state,
      {
        last_decision: finalDecision.decision,
        last_analysis: new Date().toISOString(),
      }
    )

    // 10. 응답 반환
    return NextResponse.json({
      run_id: runId,
      conversation_id: convId,
      final_decision: finalDecision,
      gpt_output: gptOutput,
      gemini_alt: geminiOutput,
      rag_context: {
        total_retrieved: ragContext.total_retrieved,
        top_chunks: ragContext.chunks.slice(0, 3).map(c => ({
          section: c.section_title,
          page: c.source_page,
          content: c.content.substring(0, 100) + '...',
        })),
      },
      state_machine: {
        current_state: stateMachine.getState(),
        description: stateMachine.getStateDescription(),
        duration_ms: stateMachine.getStateDuration(),
      },
      risk_check: riskCheck,
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error}` },
      { status: 500 }
    )
  }
}

/**
 * GET /api/chat?conversation_id=xxx
 * 대화 히스토리 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Missing conversation_id parameter' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // 대화 정보 조회
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Run 히스토리 조회
    const { data: runs, error: runsError } = await supabase
      .from('runs')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (runsError) {
      console.error('Failed to fetch runs:', runsError)
    }

    return NextResponse.json({
      conversation,
      runs: runs || [],
      total_runs: runs?.length || 0,
    })

  } catch (error) {
    console.error('Chat history error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
