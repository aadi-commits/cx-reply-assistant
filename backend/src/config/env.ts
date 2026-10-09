/**
 * Centralised, validated environment access.
 * Import `env` everywhere instead of reading process.env directly.
 */

function bool(name: string, def = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return /^(1|true|yes|require)$/i.test(v);
}

export const env = {
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // LLM (OpenRouter, OpenAI-compatible chat completions)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  },

  // Embeddings (OpenAI-compatible). Can point at OpenAI, DeepInfra, etc.
  embedding: {
    apiKey: process.env.EMBEDDING_API_KEY || '',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    baseUrl: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
    dimensions: 1536
  },

  // Retrieval tuning
  retrieval: {
    // cosine similarity in [0,1]; below this an entry is considered irrelevant
    minSimilarity: Number(process.env.RETRIEVAL_MIN_SIMILARITY || 0.3),
    maxResults: Number(process.env.RETRIEVAL_MAX_RESULTS || 4),
    // how many recent messages to include as conversation context
    historyLimit: Number(process.env.RETRIEVAL_HISTORY_LIMIT || 8)
  },

  // External call timeout (ms)
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),

  isProd: process.env.NODE_ENV === 'production',
  // When true, allow a clearly-labeled dev fallback if AI keys are missing.
  allowDevFallback: bool('ALLOW_DEV_FALLBACK', true),

  auth: {
    // Demo auth layer. Enabled by default; set AUTH_ENABLED=false to open the API.
    enabled: bool('AUTH_ENABLED', true),
    // HMAC secret for signing demo tokens. MUST be overridden in production.
    secret: process.env.AUTH_SECRET || 'dev-insecure-demo-secret-change-me'
  }
};

export const hasLlm = () => Boolean(env.openrouter.apiKey);
export const hasEmbeddings = () => Boolean(env.embedding.apiKey);
