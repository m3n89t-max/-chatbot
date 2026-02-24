import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'
import { processDocument } from '@/lib/ocr/pipeline'

/**
 * POST /api/upload
 * PNG/PDF 문서 업로드 및 OCR 처리
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const sourceType = formData.get('source_type') as 'png' | 'pdf'

    if (!file || !title || !sourceType) {
      return NextResponse.json(
        { error: 'Missing required fields: file, title, source_type' },
        { status: 400 }
      )
    }

    // 파일 타입 검증
    const allowedTypes = ['image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG and PDF are allowed.' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // 1. 문서 메타데이터 저장
    const documentId = uuidv4()
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        title,
        source_type: sourceType,
      })

    if (docError) {
      console.error('Document insert error:', docError)
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    // 2. Supabase Storage에 파일 업로드
    const fileName = `${documentId}/${file.name}`
    const fileBuffer = await file.arrayBuffer()
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('File upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // 3. 파일을 페이지로 분할 (PDF의 경우 여러 페이지, PNG는 단일)
    let imageBuffers: Buffer[] = []
    
    if (sourceType === 'png') {
      imageBuffers = [Buffer.from(fileBuffer)]
      
      // 페이지 정보 저장
      await supabase.from('document_pages').insert({
        document_id: documentId,
        page_no: 1,
        image_path: fileName,
      })
    } else {
      // PDF 처리는 별도 라이브러리 필요 (pdf-parse 등)
      // 여기서는 간단히 단일 페이지로 처리
      imageBuffers = [Buffer.from(fileBuffer)]
      
      await supabase.from('document_pages').insert({
        document_id: documentId,
        page_no: 1,
        image_path: fileName,
      })
    }

    // 4. OCR 파이프라인 실행 (비동기)
    // 실제 운영에서는 큐 시스템(BullMQ 등) 사용 권장
    processDocument(documentId, imageBuffers)
      .then(result => {
        console.log(`Document ${documentId} processed: ${result.chunksCreated} chunks`)
      })
      .catch(error => {
        console.error(`Failed to process document ${documentId}:`, error)
      })

    return NextResponse.json({
      document_id: documentId,
      message: 'Document uploaded successfully. Processing in background...',
      pages: imageBuffers.length,
    })

  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/upload?document_id=xxx
 * 문서 처리 상태 확인
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

    // 문서 정보 조회
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // 생성된 청크 수 조회
    const { count, error: countError } = await supabase
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId)

    if (countError) {
      console.error('Count error:', countError)
    }

    return NextResponse.json({
      document: doc,
      chunks_created: count || 0,
      status: (count || 0) > 0 ? 'completed' : 'processing',
    })

  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
