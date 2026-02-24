# Neely RAG Trading Bot

NEoWave 기반 멀티모델 자동매매 판단 시스템

## 🎯 프로젝트 개요

Glenn Neely의 NEoWave 교육자료를 기반으로 한 RAG 시스템을 구축하고, ChatGPT와 Gemini를 활용한 멀티모델 분석을 통해 거래 판단을 제공하는 시스템입니다.

## 📚 기술 스택

- **Frontend**: Next.js 14 (App Router), Tailwind CSS
- **Backend**: Next.js Route Handlers
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI Models**: 
  - OpenAI GPT-4 (Primary Count)
  - Google Gemini (Alternative Count + Judge)
- **OCR**: Google Cloud Vision API
- **Vector Search**: pgvector

## 🏗️ 아키텍처

```
[사용자]
    ↓
Next.js (Frontend + API)
    ↓
Supabase (Auth / DB / Storage / pgvector)
    ↓
OCR Pipeline (PNG → Text)
    ↓
RAG Retrieval
    ↓
① ChatGPT (Primary Count)
② Gemini (Alternative Count)
    ↓
③ Gemini Judge (공격형 점수 선택)
    ↓
Signal JSON 저장
```

## 📁 프로젝트 구조

```
chtabot/
├── app/
│   ├── api/
│   │   ├── upload/       # 문서 업로드 API
│   │   ├── chat/         # 분석 요청 API
│   │   └── index-doc/    # 문서 인덱싱 API
│   ├── dashboard/        # 대시보드 UI
│   ├── upload/           # 업로드 페이지
│   ├── chat/             # 채팅 인터페이스
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── types.ts          # TypeScript 타입 정의
│   ├── supabase.ts       # Supabase 클라이언트
│   ├── ocr/              # OCR 파이프라인
│   │   ├── vision.ts
│   │   ├── structure.ts
│   │   └── pipeline.ts
│   ├── rag/              # RAG 시스템
│   │   ├── embeddings.ts
│   │   ├── search.ts
│   │   └── index.ts
│   ├── models/           # AI 모델 통합
│   │   ├── chatgpt.ts
│   │   ├── gemini.ts
│   │   └── index.ts
│   ├── judge/            # Judge 알고리즘
│   │   └── index.ts
│   └── state-machine/    # 상태머신
│       └── index.ts
├── supabase/
│   └── schema.sql        # 데이터베이스 스키마
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## 🚀 시작하기

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Google
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GOOGLE_CLOUD_VISION_API_KEY=your_google_vision_api_key

# System Config
MAX_RISK_PERCENT=2
MAX_CONCURRENT_POSITIONS=3
CONSECUTIVE_LOSS_THRESHOLD=3
```

### 2. 의존성 설치

```bash
npm install
```

### 3. Supabase 스키마 적용

Supabase 대시보드에서 SQL 에디터를 열고 `supabase/schema.sql` 파일의 내용을 실행하세요.

### 4. 개발 서버 실행

**중요**: 아래 명령어를 직접 실행하지 마시고, 터미널에서 수동으로 실행해주세요.

```bash
npm run dev
```

서버가 실행되면 http://localhost:3000 에서 접속할 수 있습니다.

## 📖 주요 기능

### 1. 문서 업로드 및 OCR 처리

- Neely 교육자료(PNG/PDF)를 업로드
- Google Cloud Vision으로 OCR 수행
- Gemini로 텍스트 구조화
- 자동 청크 생성 및 임베딩

### 2. RAG 기반 지식 검색

- Vector similarity search (pgvector)
- 우선순위 기반 검색 (rule > exception > definition)
- 하이브리드 검색 (벡터 + 키워드)

### 3. 멀티모델 분석

- **ChatGPT**: 보수적 Primary Wave Count
- **Gemini**: 공격적 Alternative Count
- **Judge**: 공격형 점수화 알고리즘으로 최종 선택

### 4. 상태머신

- `WAITING` → `BREAKOUT_WATCH` → `CONFIRMED_IMPULSE/CORRECTION`
- 무효화 조건 추적
- 리셋 메커니즘

### 5. 리스크 관리

- 최대 동시 포지션 제한
- 연속 손실 임계값
- 자동 HOLD 전환

## 🔄 API 엔드포인트

### POST /api/upload

문서 업로드 및 OCR 처리

**Request:**
```json
{
  "file": File,
  "title": "문서 제목",
  "source_type": "png" | "pdf"
}
```

### POST /api/chat

분석 요청

**Request:**
```json
{
  "query": "차트 분석 요청",
  "conversation_id": "optional",
  "symbol": "BTCUSDT",
  "timeframe": "4H",
  "user_id": "user123"
}
```

**Response:**
```json
{
  "final_decision": {
    "decision": "LONG",
    "entry_trigger": "Break above 45200",
    "invalidation": "Below 43800",
    "risk_percent": 1.5,
    "state": "BREAKOUT_WATCH",
    "reasoning": "..."
  },
  "gpt_output": {...},
  "gemini_alt": {...}
}
```

### GET /api/index-doc?document_id=xxx

문서 인덱싱 상태 확인

## 📊 데이터베이스 스키마

주요 테이블:
- `documents`: 문서 메타데이터
- `knowledge_chunks`: RAG 검색용 임베딩된 청크
- `conversations`: 대화 세션
- `runs`: 분석 로그
- `trading_states`: 상태머신 추적
- `risk_tracking`: 리스크 관리

## ⚠️ 주의사항

- 본 시스템은 **연구/전략 설계 목적**이며 투자 조언이 아닙니다.
- 실제 거래에 사용하기 전 충분한 백테스팅이 필요합니다.
- API 키는 절대 공개하지 마세요.

## 📝 개발 로드맵

### Phase 1 (MVP) ✅
- [x] PNG OCR + RAG 구축
- [x] ChatGPT 단일 분석

### Phase 2 🚧
- [x] Gemini 대안 + Judge
- [x] JSON Signal 저장

### Phase 3 📅
- [ ] 상태머신 고도화
- [ ] TradingView Webhook 연동
- [ ] 백테스팅 시스템

## 🤝 기여

이슈와 PR을 환영합니다!

## 📄 라이선스

MIT License

---

**Made with ❤️ for NEoWave Traders**
