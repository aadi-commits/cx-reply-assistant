SET search_path = public, extensions;

-- Migration 001: AI layer support
-- Idempotent. Safe to run multiple times.
-- Adds: keyword full-text search, vector index, embedding staleness tracking,
-- and richer ai_reply_logs columns for the audit trail.

-- ---------------------------------------------------------------------------
-- Knowledge base: full-text search (keyword fallback) + embedding staleness
-- ---------------------------------------------------------------------------

-- Generated tsvector over title + content for the keyword retrieval path.
ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_kb_entries_search_tsv ON kb_entries USING GIN (search_tsv);

-- Track when the embedding was last generated. If NULL or older than updated_at,
-- the embedding is stale and must be refreshed before semantic retrieval.
ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

-- Approximate-nearest-neighbour index for cosine similarity on the embedding.
-- HNSW works well for frequent reads and incremental writes.
CREATE INDEX IF NOT EXISTS idx_kb_entries_embedding_hnsw
  ON kb_entries USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- AI reply logs: richer audit trail
-- ---------------------------------------------------------------------------

ALTER TABLE ai_reply_logs
  ADD COLUMN IF NOT EXISTS retrieval_method VARCHAR(20),         -- 'vector' | 'keyword' | 'none'
  ADD COLUMN IF NOT EXISTS model VARCHAR(120),                   -- LLM model id used
  ADD COLUMN IF NOT EXISTS confidence VARCHAR(20),               -- 'answered' | 'insufficient' | 'no_knowledge'
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS message_id UUID,                      -- the customer message this reply answers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Normalise the status vocabulary. Explicit lifecycle:
--   GENERATED -> EDITED -> APPROVED -> SENT ; or FAILED at any point.
ALTER TABLE ai_reply_logs
  DROP CONSTRAINT IF EXISTS ai_reply_logs_status_check;
ALTER TABLE ai_reply_logs
  ADD CONSTRAINT ai_reply_logs_status_check
  CHECK (status IN ('GENERATED', 'EDITED', 'APPROVED', 'SENT', 'FAILED'));

CREATE INDEX IF NOT EXISTS idx_ai_logs_brand_id ON ai_reply_logs(brand_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON ai_reply_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Messages: index for ordered history retrieval
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Knowledge categories: add GENERAL (general support) to the allowed set
-- ---------------------------------------------------------------------------
ALTER TABLE kb_entries DROP CONSTRAINT IF EXISTS kb_entries_category_check;
ALTER TABLE kb_entries
  ADD CONSTRAINT kb_entries_category_check
  CHECK (category IN ('RETURN', 'REFUND', 'SHIPPING', 'CANCELLATION', 'GENERAL'));
