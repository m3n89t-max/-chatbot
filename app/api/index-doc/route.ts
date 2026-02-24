import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * GET /api/index-doc?document_id=xxx
 * 문서 인덱싱 상태 확인
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('document_id')

    if (!documentId) {
      return NextResponse.json(
        { error: 'Missing document_id parameter' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // 문서 청크 조회
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('*')
      .eq('document_id', documentId)

    if (error) {
      console.error('Chunk query error:', error)
      return NextResponse.json(
        { error: 'Failed to query chunks' },
        { status: 500 }
      )
    }

    // 타입별 통계
    const stats = {
      total: chunks?.length || 0,
      rules: chunks?.filter(c => c.chunk_type === 'rule').length || 0,
      exceptions: chunks?.filter(c => c.chunk_type === 'exception').length || 0,
      definitions: chunks?.filter(c => c.chunk_type === 'definition').length || 0,
    }

    return NextResponse.json({
      document_id: documentId,
      indexed: true,
      stats,
      chunks: chunks?.map(c => ({
        id: c.id,
        type: c.chunk_type,
        section: c.section_title,
        page: c.source_page,
        preview: c.content.substring(0, 100) + '...',
      })) || [],
    })

  } catch (error) {
    console.error('Index-doc API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/index-doc
 * 문서 재인덱싱 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { document_id } = body

    if (!document_id) {
      return NextResponse.json(
        { error: 'Missing document_id' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // 기존 청크 삭제
    const { error: deleteError } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', document_id)

    if (deleteError) {
      console.error('Delete chunks error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete existing chunks' },
        { status: 500 }
      )
    }

    // 재처리는 별도 큐 시스템에서 처리
    // 여기서는 단순히 재인덱싱 요청만 받음
    return NextResponse.json({
      message: 'Re-indexing triggered. Processing in background...',
      document_id,
    })

  } catch (error) {
    console.error('Re-index API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/index-doc?document_id=xxx
 * 문서 및 청크 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('document_id')

    if (!documentId) {
      return NextResponse.json(
        { error: 'Missing document_id parameter' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // CASCADE로 자동으로 관련 데이터도 삭제됨
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (error) {
      console.error('Delete document error:', error)
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      )
    }

    // Storage에서도 파일 삭제
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([`${documentId}`])

    if (storageError) {
      console.warn('Storage delete warning:', storageError)
      // Storage 삭제 실패는 경고만 하고 계속 진행
    }

    return NextResponse.json({
      message: 'Document deleted successfully',
      document_id: documentId,
    })

  } catch (error) {
    console.error('Delete API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
