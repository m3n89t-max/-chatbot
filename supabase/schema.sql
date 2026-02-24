-- ============================================
-- Neely RAG Trading Bot - Supabase Schema
-- ============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. Documents Table
-- ============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('png', 'pdf')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ============================================
-- 2. Document Pages Table
-- ============================================
CREATE TABLE document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_no INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_document_pages_document_id ON document_pages(document_id);
CREATE UNIQUE INDEX idx_document_pages_unique ON document_pages(document_id, page_no);

-- ============================================
-- 3. Knowledge Chunks Table (RAG 핵심)
-- ============================================
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_type TEXT NOT NULL CHECK (chunk_type IN ('rule', 'exception', 'definition')),
    section_title TEXT,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI ada-002 dimension
    source_page INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector similarity search index
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_chunk_type ON knowledge_chunks(chunk_type);

-- ============================================
-- 4. Conversations Table
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- ============================================
-- 5. Runs Table (판정 로그)
-- ============================================
CREATE TABLE runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_query TEXT NOT NULL,
    gpt_output JSONB NOT NULL,
    gemini_alt JSONB NOT NULL,
    final_decision JSONB NOT NULL,
    rag_context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_runs_conversation_id ON runs(conversation_id);
CREATE INDEX idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX idx_runs_final_decision ON runs USING GIN (final_decision);

-- ============================================
-- 6. Trading States Table (상태머신 추적)
-- ============================================
CREATE TABLE trading_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    current_state TEXT NOT NULL CHECK (current_state IN (
        'WAITING',
        'BREAKOUT_WATCH',
        'CONFIRMED_IMPULSE',
        'CONFIRMED_CORRECTION',
        'INVALIDATED_RESET'
    )),
    state_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trading_states_conversation_id ON trading_states(conversation_id);
CREATE INDEX idx_trading_states_symbol ON trading_states(symbol);
CREATE UNIQUE INDEX idx_trading_states_unique ON trading_states(conversation_id, symbol, timeframe);

-- ============================================
-- 7. Risk Management Table
-- ============================================
CREATE TABLE risk_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    active_positions INTEGER DEFAULT 0,
    consecutive_losses INTEGER DEFAULT 0,
    is_trading_enabled BOOLEAN DEFAULT true,
    last_trade_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_risk_tracking_user_id ON risk_tracking(user_id);

-- ============================================
-- RPC Functions
-- ============================================

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 8
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    chunk_type TEXT,
    section_title TEXT,
    content TEXT,
    source_page INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id,
        kc.document_id,
        kc.chunk_type,
        kc.section_title,
        kc.content,
        kc.source_page,
        1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Update risk tracking function
CREATE OR REPLACE FUNCTION update_risk_tracking(
    p_user_id UUID,
    p_is_loss BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_consecutive_losses INTEGER;
BEGIN
    -- Get or create risk tracking record
    INSERT INTO risk_tracking (user_id, consecutive_losses)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Update consecutive losses
    IF p_is_loss THEN
        UPDATE risk_tracking
        SET 
            consecutive_losses = consecutive_losses + 1,
            is_trading_enabled = CASE 
                WHEN consecutive_losses + 1 >= 3 THEN false
                ELSE true
            END,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSE
        UPDATE risk_tracking
        SET 
            consecutive_losses = 0,
            is_trading_enabled = true,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;
END;
$$;

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_tracking ENABLE ROW LEVEL SECURITY;

-- Public read access for knowledge base
CREATE POLICY "Public read access for documents"
    ON documents FOR SELECT
    USING (true);

CREATE POLICY "Public read access for knowledge_chunks"
    ON knowledge_chunks FOR SELECT
    USING (true);

-- User-specific policies for conversations
CREATE POLICY "Users can view own conversations"
    ON conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
    ON conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own runs"
    ON runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = runs.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own runs"
    ON runs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = runs.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- Trading states policies
CREATE POLICY "Users can view own trading states"
    ON trading_states FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = trading_states.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own trading states"
    ON trading_states FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = trading_states.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- Risk tracking policies
CREATE POLICY "Users can view own risk tracking"
    ON risk_tracking FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own risk tracking"
    ON risk_tracking FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- Sample Data (Optional - for testing)
-- ============================================

-- Insert sample document
INSERT INTO documents (id, title, source_type)
VALUES ('00000000-0000-0000-0000-000000000001', 'Neely Wave Theory - Chapter 1', 'pdf');

-- Insert sample knowledge chunk
INSERT INTO knowledge_chunks (document_id, chunk_type, section_title, content, source_page)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'rule',
    'Impulse Wave Rules',
    'Wave 2 must not retrace beyond the start of wave 1. This is a fundamental rule that cannot be violated.',
    14
);

COMMENT ON TABLE documents IS 'Neely 교육자료 문서 메타데이터';
COMMENT ON TABLE knowledge_chunks IS 'RAG 검색을 위한 임베딩된 지식 청크';
COMMENT ON TABLE runs IS 'ChatGPT + Gemini 판정 로그';
COMMENT ON TABLE trading_states IS '상태머신 기반 거래 상태 추적';
