# 🚀 설치 및 실행 가이드

## 📋 사전 요구사항

- Node.js 18+ 설치
- Supabase 계정
- OpenAI API 키
- Google Cloud Vision API 키
- Google Generative AI (Gemini) API 키

## 🔧 설치 단계

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 아래 내용을 채워주세요:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=sk-...

# Google
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
GOOGLE_CLOUD_VISION_API_KEY={"type":"service_account",...}

# System Config
MAX_RISK_PERCENT=2
MAX_CONCURRENT_POSITIONS=3
CONSECUTIVE_LOSS_THRESHOLD=3
```

### 3. Supabase 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 파일 내용 실행
3. Storage에서 `documents` 버킷 생성 (Public 설정)

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

## 📱 주요 페이지

- **홈**: http://localhost:3000
- **대시보드**: http://localhost:3000/dashboard
- **문서 업로드**: http://localhost:3000/upload
- **채팅 분석**: http://localhost:3000/chat

## 🧪 테스트

### 1. 문서 업로드 테스트

1. `/upload` 페이지 접속
2. Neely 교육자료 PNG 파일 업로드
3. 처리 완료 후 Document ID 확인
4. `/api/index-doc?document_id=xxx`로 인덱싱 상태 확인

### 2. 채팅 분석 테스트

1. `/chat` 페이지 접속
2. 예시 질문 입력: "BTC 4H 차트에서 임펄스 웨이브 5파가 완성된 것 같습니다"
3. AI 분석 결과 확인

## 🐛 문제 해결

### 의존성 설치 오류

```bash
# 캐시 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

### Supabase 연결 오류

- `.env` 파일의 URL과 키가 정확한지 확인
- Supabase 프로젝트가 활성화되어 있는지 확인

### OCR 처리 오류

- Google Cloud Vision API 키가 올바른 JSON 형식인지 확인
- API 할당량이 남아있는지 확인

## 📚 추가 리소스

- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [OpenAI API 문서](https://platform.openai.com/docs)
- [Gemini API 문서](https://ai.google.dev/docs)
