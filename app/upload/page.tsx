'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [titlePrefix, setTitlePrefix] = useState('')
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<{ success: any[]; errors: { name: string; message: string }[] }>({ success: [], errors: [] })
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected?.length) return
    const list = Array.from(selected).filter(f =>
      f.type === 'image/png' || f.type === 'application/pdf'
    )
    setFiles(list)
    if (!titlePrefix && list.length > 0) {
      setTitlePrefix(list[0].name.replace(/\.(png|pdf)$/i, ''))
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (files.length === 0) {
      setError('파일을 하나 이상 선택해주세요.')
      return
    }

    setUploading(true)
    setError(null)
    setResults({ success: [], errors: [] })

    const success: any[] = []
    const errors: { name: string; message: string }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const title = titlePrefix.trim()
        ? `${titlePrefix}${files.length > 1 ? ` (${i + 1})` : ''}`
        : file.name.replace(/\.(png|pdf)$/i, '')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('source_type', file.type.includes('pdf') ? 'pdf' : 'png')

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await response.json()
        if (!response.ok) {
          errors.push({ name: file.name, message: data.error || '업로드 실패' })
        } else {
          success.push({ ...data, fileName: file.name })
        }
      } catch (err: any) {
        errors.push({ name: file.name, message: err.message || '업로드 중 오류' })
      }
      setResults({ success, errors })
    }

    setUploading(false)
    setFiles([])
    setTitlePrefix('')
    const fileInput = document.getElementById('file-input') as HTMLInputElement
    if (fileInput) fileInput.value = ''
    if (errors.length > 0 && success.length === 0) {
      setError(errors.map(e => `${e.name}: ${e.message}`).join(' / '))
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
            {/* 제목 (선택, 여러 문서일 때 접두사로 사용) */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                문서 제목 (선택)
              </label>
              <input
                type="text"
                id="title"
                value={titlePrefix}
                onChange={(e) => setTitlePrefix(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-4 py-2"
                placeholder="예: Neely Wave Theory (비워두면 파일명 사용)"
              />
            </div>

            {/* 여러 파일 선택 */}
            <div>
              <label
                htmlFor="file-input"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                파일 선택 (PNG 또는 PDF)
              </label>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Ctrl 또는 Shift를 누른 채로 클릭하면 여러 파일을 한 번에 선택할 수 있습니다.
              </p>
              <input
                type="file"
                id="file-input"
                accept=".png,.pdf,image/png,application/pdf"
                multiple={true}
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  dark:file:bg-blue-900/30 dark:file:text-blue-400"
              />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-3 py-2">
                      <span>{f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400"
                      >
                        제거
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {uploading ? `업로드 중... (${results.success.length + results.errors.length}/${files.length})` : `${files.length}개 문서 업로드 및 처리 시작`}
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

          {/* 결과: 여러 건 성공/실패 */}
          {!uploading && (results.success.length > 0 || results.errors.length > 0) && (
            <div className="mt-4 space-y-3">
              {results.success.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-400 mb-2">
                    ✅ {results.success.length}개 업로드 성공
                  </h3>
                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    {results.success.map((r, i) => (
                      <li key={i}>
                        {r.fileName} → 문서 ID: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{r.document_id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                  <h3 className="text-lg font-semibold text-red-800 dark:text-red-400 mb-2">
                    ❌ {results.errors.length}개 실패
                  </h3>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {results.errors.map((e, i) => (
                      <li key={i}>{e.name}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
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
