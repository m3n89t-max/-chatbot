'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

/** 업로드된 차트 이미지 1개 (시간봉 라벨 선택 가능) */
export interface UploadedChartImage {
  dataUrl: string
  label?: string // 예: '5분봉', '15분봉', '1시간봉', '4시간봉', '일봉', '주봉'
}

const TIMEFRAME_LABELS: UploadedChartImage['label'][] = ['5분봉', '15분봉', '1시간봉', '4시간봉', '일봉', '주봉']

interface Message {
  role: 'user' | 'assistant'
  content: string
  data?: any
  /** 단일 이미지 (하위 호환) */
  imageUrl?: string
  /** 다중 이미지 (dataUrl + 선택적 라벨) */
  imageUrls?: UploadedChartImage[]
}

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [uploadedImages, setUploadedImages] = useState<UploadedChartImage[]>([]) // 여러 장 업로드 (5분봉·15분봉·일봉 등)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userId = 'demo-user'

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadConversations = async () => {
    try {
      const response = await fetch(`/api/conversations?user_id=${userId}`)
      const data = await response.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }

  const loadConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat?conversation_id=${conversationId}`)
      const data = await response.json()
      
      setCurrentConversationId(conversationId)
      
      // runs를 messages로 변환
      const loadedMessages: Message[] = []
      data.runs?.forEach((run: any) => {
        loadedMessages.push({
          role: 'user',
          content: run.user_query,
        })
        loadedMessages.push({
          role: 'assistant',
          content: formatAnalysisResponse(run),
          data: run,
        })
      })
      
      setMessages(loadedMessages.reverse())
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setMessages([])
    setInput('')
    setUploadedImages([])
  }

  const addImageToQueue = (dataUrl: string, label?: string) => {
    setUploadedImages(prev => [...prev, { dataUrl, label }])
  }

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            addImageToQueue(event.target?.result as string)
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    let index = 0
    const processNext = () => {
      if (index >= files.length) {
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      const file = files[index]
      const reader = new FileReader()
      reader.onload = (event) => {
        addImageToQueue(event.target?.result as string)
        index++
        processNext()
      }
      reader.readAsDataURL(file)
    }
    processNext()
  }

  const removeImage = (idx: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== idx))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const setImageLabel = (idx: number, label: UploadedChartImage['label']) => {
    setUploadedImages(prev =>
      prev.map((img, i) => (i === idx ? { ...img, label } : img))
    )
  }

  const deleteConversation = async (conversationId: string) => {
    if (!confirm('이 대화를 삭제하시겠습니까?')) return

    try {
      await fetch(`/api/conversations?conversation_id=${conversationId}`, {
        method: 'DELETE',
      })
      
      loadConversations()
      
      if (currentConversationId === conversationId) {
        startNewChat()
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const hasImages = uploadedImages.length > 0
    if ((!input.trim() && !hasImages) || loading) return

    const currentImages = [...uploadedImages]
    const userMessage: Message = {
      role: 'user',
      content: input || '차트 이미지 분석 요청',
      imageUrls: currentImages.length ? currentImages : undefined,
      imageUrl: currentImages.length === 1 ? currentImages[0].dataUrl : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setUploadedImages([])
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: input || '차트 이미지를 분석해주세요',
          conversation_id: currentConversationId,
          symbol: 'BTCUSDT',
          timeframe: '4H',
          user_id: userId,
          images: currentImages, // 다중 이미지 (dataUrl + 라벨)
        }),
      })

      const rawText = await response.text()
      let data: any
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        // 서버가 HTML 에러 페이지를 반환한 경우 (413/500 등)
        const hint = response.status === 413
          ? '요청 크기가 너무 큽니다. 이미지 수를 줄이거나 해상도를 낮춰 보세요.'
          : '서버 오류가 발생했습니다. 잠시 후 다시 시도하거나 이미지 수를 줄여 보세요.'
        throw new Error(`${hint} (${response.status})`)
      }

      if (!response.ok) {
        throw new Error(data.error || '분석 실패')
      }

      // 새 대화인 경우 conversation_id 저장
      if (!currentConversationId && data.conversation_id) {
        setCurrentConversationId(data.conversation_id)
        loadConversations() // 목록 새로고침
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: formatAnalysisResponse(data),
        data,
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error: any) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `❌ 오류: ${error.message || '알 수 없는 오류가 발생했습니다.'}`,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className={`bg-gray-900 text-white transition-all duration-300 ${
        sidebarOpen ? 'w-64' : 'w-0'
      } overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={startNewChat}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <span className="text-xl">+</span>
            <span className="font-medium">New Chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              대화 내역 없음
            </p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`group relative p-3 rounded-lg mb-1 cursor-pointer transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-gray-800'
                    : 'hover:bg-gray-800'
                }`}
                onClick={() => loadConversation(conv.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {conv.title || '새 대화'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(conv.updated_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 ml-2 p-1 hover:bg-gray-700 rounded transition-opacity"
                  >
                    <span className="text-red-400">🗑️</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← 홈으로
          </Link>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <span className="text-xl">☰</span>
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              💬 Neely 분석 챗봇
            </h1>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {messages.length === 0 && (
              <WelcomeScreen onExampleClick={setInput} />
            )}

            {messages.map((message, idx) => (
              <MessageBubble key={idx} message={message} />
            ))}

            {loading && <LoadingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="max-w-4xl mx-auto">
            {/* 다중 이미지 미리보기 (5분봉·15분봉·일봉 등 한꺼번에) */}
            {uploadedImages.length > 0 && (
              <div className="mb-3">
                {uploadedImages.length > 4 && (
                  <p className="text-amber-600 dark:text-amber-400 text-sm mb-2">
                    이미지가 많으면 요청이 실패할 수 있습니다. 4~6장 이하·해상도 낮춤을 권장합니다.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                {uploadedImages.map((img, idx) => (
                  <div key={idx} className="relative inline-block">
                    <img
                      src={img.dataUrl}
                      alt={img.label || `차트 ${idx + 1}`}
                      className="max-h-32 rounded-lg border-2 border-blue-500 object-cover"
                    />
                    <select
                      value={img.label ?? ''}
                      onChange={(e) => setImageLabel(idx, (e.target.value || undefined) as UploadedChartImage['label'])}
                      className="absolute bottom-0 left-0 right-0 rounded-b bg-black/70 text-white text-xs py-1 px-1 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">시간봉 선택</option>
                      {TIMEFRAME_LABELS.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer font-semibold transition-colors flex items-center justify-center"
                title="차트 이미지 여러 장 업로드 (5분봉·15분봉·일봉 등)"
              >
                📎
              </label>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handleImagePaste}
                placeholder="차트 상황을 설명하거나 이미지를 붙여넣으세요... (Ctrl+V, 여러 장 가능)"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && uploadedImages.length === 0)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
              >
                전송
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen({ onExampleClick }: { onExampleClick: (text: string) => void }) {
  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">
        Neely 웨이브 분석을 시작하세요
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        차트 상황을 설명하면 AI가 NEoWave 이론을 바탕으로 분석합니다.
        <br />
        <span className="text-sm">5분봉·15분봉·1시간봉·4시간봉·일봉·주봉 등 여러 장을 한꺼번에 올리면 중기·단기 관점으로 단타 위주 분석을 받을 수 있습니다.</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <ExampleQuery
          text="BTC 4H 차트에서 임펄스 웨이브 5파가 완성된 것 같습니다"
          onClick={onExampleClick}
        />
        <ExampleQuery
          text="현재 조정 파동 ABC 중 어디쯤인가요?"
          onClick={onExampleClick}
        />
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className="space-y-4">
      {/* User Message */}
      {isUser && (
        <div className="flex items-start gap-4 flex-row-reverse">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 bg-blue-600">
            U
          </div>
          <div className="flex-1 rounded-lg p-4 bg-blue-600 text-white">
            {message.imageUrls && message.imageUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.imageUrls.map((img, i) => (
                  <div key={i} className="relative">
                    <img
                      src={img.dataUrl}
                      alt={img.label || `차트 ${i + 1}`}
                      className="max-w-[200px] max-h-32 rounded-lg border-2 border-white object-cover"
                    />
                    {img.label && (
                      <span className="absolute bottom-0 left-0 right-0 rounded-b bg-black/70 text-white text-xs py-0.5 text-center">
                        {img.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!message.imageUrls?.length && message.imageUrl && (
              <img
                src={message.imageUrl}
                alt="업로드된 차트"
                className="max-w-md rounded-lg mb-2 border-2 border-white"
              />
            )}
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        </div>
      )}

      {/* AI Messages - Show GPT and Gemini separately */}
      {!isUser && message.data && (
        <div className="space-y-4">
          {/* ChatGPT Response */}
          {message.data.gpt_output && (
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-green-600">
                GPT
              </div>
              <div className="flex-1 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border-l-4 border-green-600">
                <div className="font-semibold mb-2 text-green-600">ChatGPT</div>
                <ModelAnalysis output={message.data.gpt_output} />
              </div>
            </div>
          )}

          {/* Gemini Response */}
          {message.data.gemini_alt && (
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-purple-600">
                GEM
              </div>
              <div className="flex-1 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border-l-4 border-purple-600">
                <div className="font-semibold mb-2 text-purple-600">Gemini</div>
                <ModelAnalysis output={message.data.gemini_alt} />
              </div>
            </div>
          )}

          {/* Final Decision */}
          {message.data.final_decision && (
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-blue-600">
                Judge
              </div>
              <div className="flex-1 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 shadow-sm border-l-4 border-blue-600">
                <div className="font-semibold mb-2 text-blue-600">Judge (최종 판단)</div>
                <DecisionCard decision={message.data.final_decision} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simple AI response without data */}
      {!isUser && !message.data && (
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-green-600">
            GPT
          </div>
          <div className="flex-1 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border-l-4 border-green-600">
            <div className="font-semibold mb-2 text-green-600">ChatGPT</div>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelAnalysis({ output }: { output: any }) {
  return (
    <div className="space-y-3 text-sm">
      {/* 자연스러운 설명 (있으면 먼저 보여주기) */}
      {output.explanation && (
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
          <div className="text-gray-800 dark:text-gray-200 leading-relaxed">
            {output.explanation}
          </div>
        </div>
      )}

      <div>
        <span className="font-semibold">📊 시나리오:</span>
        <p className="text-gray-700 dark:text-gray-300 mt-1">{output.scenario_label}</p>
      </div>
      <div>
        <span className="font-semibold">🎯 방향:</span>
        <span className={`ml-2 px-2 py-1 rounded text-xs font-bold ${
          output.direction === 'LONG' ? 'bg-green-100 text-green-800' :
          output.direction === 'SHORT' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {output.direction}
        </span>
      </div>
      <div>
        <span className="font-semibold">✅ 진입 조건:</span>
        <p className="text-gray-700 dark:text-gray-300 mt-1">{output.confirmation_trigger}</p>
      </div>
      <div>
        <span className="font-semibold">❌ 무효화:</span>
        <p className="text-gray-700 dark:text-gray-300 mt-1">{output.invalidation_level}</p>
      </div>
      <div>
        <span className="font-semibold">⚖️ Risk/Reward:</span>
        <span className="ml-2 text-gray-700 dark:text-gray-300">{output.risk_reward_estimate}</span>
      </div>
      {output.alternative_reasoning && (
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border-l-2 border-purple-600">
          <span className="font-semibold text-purple-800 dark:text-purple-300">💬 반박 & 대안:</span>
          <p className="text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{output.alternative_reasoning}</p>
        </div>
      )}
    </div>
  )
}

function LoadingIndicator() {
  return (
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
        AI
      </div>
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <div className="flex gap-2">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  )
}

function DecisionCard({ decision }: any) {
  if (!decision) return null

  const decisionColors: Record<string, string> = {
    LONG: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    SHORT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    HOLD: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">최종 판단:</span>
        <span className={`px-3 py-1 rounded-full font-bold ${decisionColors[decision.decision] || decisionColors.HOLD}`}>
          {decision.decision}
        </span>
      </div>
      
      <div>
        <span className="font-semibold">진입 조건:</span>
        <p className="text-gray-700 dark:text-gray-300 mt-1">{decision.entry_trigger}</p>
      </div>
      
      <div>
        <span className="font-semibold">무효화 레벨:</span>
        <p className="text-gray-700 dark:text-gray-300 mt-1">{decision.invalidation}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="font-semibold">리스크:</span>
          <p className="text-gray-700 dark:text-gray-300">{decision.risk_percent}%</p>
        </div>
        <div>
          <span className="font-semibold">상태:</span>
          <p className="text-gray-700 dark:text-gray-300">{decision.state}</p>
        </div>
      </div>
    </div>
  )
}

function ExampleQuery({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-sm"
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">{text}</p>
    </button>
  )
}

function formatAnalysisResponse(data: any): string {
  const { final_decision, gpt_output, gemini_alt, rag_context } = data

  let response = `🔍 **분석 완료**\n\n`
  
  response += `**선택된 시나리오:** ${final_decision?.selected_scenario?.toUpperCase() || 'N/A'}\n`
  response += `**판단:** ${final_decision?.decision || 'N/A'}\n`
  response += `**근거:** ${final_decision?.reasoning || 'N/A'}\n\n`
  
  if (gpt_output) {
    response += `**GPT (Primary):** ${gpt_output.scenario_label}\n`
  }
  if (gemini_alt) {
    response += `**Gemini (Alternative):** ${gemini_alt.scenario_label}\n\n`
  }
  
  if (rag_context) {
    response += `**참조된 규칙:** ${rag_context.total_retrieved}개\n`
  }

  return response
}
