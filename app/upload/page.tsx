'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      if (!title) {
        setTitle(e.target.files[0].name.replace(/\.(png|pdf)$/i, ''))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file || !title) {
      setError('파일과 제목을 모두 입력해주세요.')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('source_type', file.type.includes('pdf') ? 'pdf' : 'png')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '업로드 실패')
      }

      setResult(data)
      setFile(null)
      setTitle('')
      
      // 파일 input 초기화
      const fileInput = document.getElementById('file-input') as HTMLInputElement
      if (fileInput) fileInput.value = ''

    } catch (err: any) {
      setError(err.message || '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              📤 문서 업로드
            </h1>
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              ← 홈으로
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Input */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                문서 제목
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-4 py-2"
                placeholder="예: Neely Wave Theory - Chapter 1"
                required
              />
            </div>

            {/* File Input */}
            <div>
              <label
                htmlFor="file-input"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                파일 선택 (PNG 또는 PDF)
              </label>
              <input
                type="file"
                id="file-input"
                accept=".png,.pdf"
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  dark:file:bg-blue-900/30 dark:file:text-blue-400"
                required
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  선택된 파일: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading || !file || !title}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {uploading ? '업로드 중...' : '업로드 및 처리 시작'}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
              <p className="text-sm text-red-800 dark:text-red-400">
                ❌ {error}
              </p>
            </div>
          )}

          {/* Success Message */}
          {result && (
            <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-400 mb-2">
                ✅ 업로드 성공!
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                {result.message}
              </p>
              <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                <p>문서 ID: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{result.document_id}</code></p>
                <p className="mt-1">페이지 수: {result.pages}</p>
              </div>
              <Link
                href={`/documents/${result.document_id}`}
                className="mt-4 inline-block text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                문서 상태 확인 →
              </Link>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
            💡 업로드 안내
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-2">
            <li>• PNG 또는 PDF 형식의 Neely 교육자료를 업로드하세요.</li>
            <li>• 업로드된 문서는 OCR 처리 후 자동으로 구조화됩니다.</li>
            <li>• 처리 시간은 문서 크기에 따라 수 분에서 수십 분이 소요될 수 있습니다.</li>
            <li>• 처리가 완료되면 RAG 검색에 자동으로 포함됩니다.</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
