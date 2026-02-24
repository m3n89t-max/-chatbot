'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Run {
  id: string
  user_query: string
  final_decision: any
  created_at: string
}

interface Stats {
  totalRuns: number
  longSignals: number
  shortSignals: number
  holdSignals: number
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState<Stats>({
    totalRuns: 0,
    longSignals: 0,
    shortSignals: 0,
    holdSignals: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentRuns()
  }, [])

  const fetchRecentRuns = async () => {
    try {
      // 실제로는 대화 ID를 통해 가져와야 하지만, 데모를 위해 샘플 데이터 사용
      setLoading(false)
      // TODO: API 연동
    } catch (error) {
      console.error('Failed to fetch runs:', error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              📊 Trading Dashboard
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="총 분석"
            value={stats.totalRuns}
            icon="📈"
            color="blue"
          />
          <StatCard
            title="LONG 신호"
            value={stats.longSignals}
            icon="🟢"
            color="green"
          />
          <StatCard
            title="SHORT 신호"
            value={stats.shortSignals}
            icon="🔴"
            color="red"
          />
          <StatCard
            title="HOLD 신호"
            value={stats.holdSignals}
            icon="⚪"
            color="gray"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link
            href="/chat"
            className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              💬 새로운 분석 시작
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              차트 분석을 요청하고 AI 판단을 받으세요
            </p>
          </Link>

          <Link
            href="/upload"
            className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              📤 문서 업로드
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Neely 교육자료를 업로드하여 지식베이스 확장
            </p>
          </Link>
        </div>

        {/* Recent Runs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              최근 분석 내역
            </h2>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600 dark:text-gray-400">로딩 중...</p>
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  아직 분석 내역이 없습니다.
                </p>
                <Link
                  href="/chat"
                  className="mt-4 inline-block text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  첫 분석 시작하기 →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {runs.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    gray: 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600',
  }

  return (
    <div className={`border rounded-lg p-6 ${colorClasses[color] || colorClasses.gray}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  )
}

function RunCard({ run }: { run: Run }) {
  const decision = run.final_decision?.decision || 'HOLD'
  const decisionColors: Record<string, string> = {
    LONG: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    SHORT: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    HOLD: 'text-gray-600 bg-gray-100 dark:bg-gray-700',
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(run.created_at).toLocaleString('ko-KR')}
          </p>
          <p className="mt-1 text-gray-900 dark:text-white font-medium">
            {run.user_query}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            decisionColors[decision] || decisionColors.HOLD
          }`}
        >
          {decision}
        </span>
      </div>
    </div>
  )
}
