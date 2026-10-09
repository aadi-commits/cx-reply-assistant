const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// ---- Auth token (demo) -----------------------------------------------------
const TOKEN_KEY = 'cx_token';
let token: string | null = safeGet();

function safeGet(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
}
export function getToken(): string | null {
  return token;
}

/** Called by the app when a request is rejected as unauthorized. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    },
    ...init
  });
  if (res.status === 401) {
    onUnauthorized?.();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = (body && body.error) || `Request failed (${res.status})`;
    const err = new Error(message) as Error & { transient?: boolean; status?: number };
    err.transient = body?.transient;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

// ---- Auth -------------------------------------------------------------------

export interface DemoAgent {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  brands: string[];
}
export interface Principal {
  agentId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  brandIds: string[];
}

export const getDemoAgents = () => req<DemoAgent[]>('/auth/agents');
export const login = (agentId: string) =>
  req<{ token: string; agent: Principal }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ agentId })
  });
export const getHealth = () => req<{ authEnabled: boolean }>('/health');

// ---- Types -----------------------------------------------------------------

export type SenderType = 'CUSTOMER' | 'AGENT' | 'AI';

export interface ConversationSummary {
  id: string;
  order_id: string;
  status: string;
  brand_id: string;
  brand_name: string;
  customer_name: string;
  customer_email: string;
}

export interface Message {
  id: string;
  sender_type: SenderType;
  content: string;
  created_at: string;
}

export interface Conversation extends ConversationSummary {
  customer_id: string;
  messages: Message[];
}

export interface Brand {
  id: string;
  name: string;
}

export interface KbEntry {
  id: string;
  brand_id: string;
  category: string;
  title: string;
  content: string;
  has_embedding?: boolean;
  embedding_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type Confidence = 'answered' | 'insufficient' | 'no_knowledge';

export interface RetrievedEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  score: number;
  relevant: boolean;
}

export interface GenerateResult {
  logId: string;
  reply: string;
  confidence: Confidence;
  needsHumanReview: boolean;
  retrieval: { method: 'vector' | 'keyword' | 'none'; entries: RetrievedEntry[] };
  model: string;
  devFallback: boolean;
}

export interface AiLog {
  id: string;
  conversation_id: string;
  brand_id: string;
  brand_name?: string;
  customer_message: string;
  retrieved_context: unknown;
  generated_response: string | null;
  agent_edited_response: string | null;
  final_response: string | null;
  status: string;
  retrieval_method: string | null;
  model: string | null;
  confidence: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Conversations ---------------------------------------------------------

export const getConversations = () => req<ConversationSummary[]>('/conversations');
export const getConversation = (id: string) => req<Conversation>(`/conversations/${id}`);

export const sendMessage = (conversationId: string, senderType: 'CUSTOMER' | 'AGENT', content: string) =>
  req<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ senderType, content })
  });

// ---- AI --------------------------------------------------------------------

export const generateReply = (conversationId: string) =>
  req<GenerateResult>(`/conversations/${conversationId}/generate`, { method: 'POST' });

export const updateLog = (logId: string, body: { agentEditedResponse?: string; status?: 'EDITED' | 'APPROVED' }) =>
  req<AiLog>(`/ai-logs/${logId}`, { method: 'PATCH', body: JSON.stringify(body) });

export const sendAiReply = (logId: string, content: string) =>
  req<{ alreadySent: boolean; message: Message | null; log: AiLog }>(`/ai-logs/${logId}/send`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });

export const getConversationLogs = (conversationId: string) =>
  req<AiLog[]>(`/conversations/${conversationId}/logs`);

export const getRecentLogs = () => req<AiLog[]>('/ai-logs');

// ---- Brands & Knowledge base ----------------------------------------------

export const getBrands = () => req<Brand[]>('/brands');
export const getKnowledge = (brandId: string) => req<KbEntry[]>(`/brands/${brandId}/knowledge`);

export const createKnowledge = (brandId: string, body: { category: string; title: string; content: string }) =>
  req<KbEntry>(`/brands/${brandId}/knowledge`, { method: 'POST', body: JSON.stringify(body) });

export const updateKnowledge = (id: string, body: { category: string; title: string; content: string }) =>
  req<KbEntry>(`/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const deleteKnowledge = (id: string) =>
  req<void>(`/knowledge/${id}`, { method: 'DELETE' });
