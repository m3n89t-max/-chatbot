import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * GET /api/conversations?user_id=xxx
 * 사용자의 대화 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id') || 'demo-user'

    const supabase = getServiceSupabase()

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        title,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Failed to fetch conversations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      conversations: conversations || [],
      total: conversations?.length || 0,
    })

  } catch (error) {
    console.error('Conversations API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/conversations?conversation_id=xxx
 * 대화 삭제
 */
export async function DELETE(request: NextRequest) {
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

    // CASCADE로 runs, trading_states도 함께 삭제됨
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)

    if (error) {
      console.error('Failed to delete conversation:', error)
      return NextResponse.json(
        { error: 'Failed to delete conversation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Conversation deleted successfully',
      conversation_id: conversationId,
    })

  } catch (error) {
    console.error('Delete conversation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/conversations
 * 대화 제목 업데이트
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversation_id, title } = body

    if (!conversation_id || !title) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const { error } = await supabase
      .from('conversations')
      .update({ 
        title,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation_id)

    if (error) {
      console.error('Failed to update conversation:', error)
      return NextResponse.json(
        { error: 'Failed to update conversation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Conversation updated successfully',
      conversation_id,
      title,
    })

  } catch (error) {
    console.error('Update conversation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
