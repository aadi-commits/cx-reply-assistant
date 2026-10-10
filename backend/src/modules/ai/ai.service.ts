import { pool } from '../../config/database';
import { env } from '../../config/env';
import { retrieveKnowledge, RetrievedEntry, RetrievalMethod } from '../../services/retrieval';
import { generateReply } from '../../services/llm';
import { PromptInput } from '../../services/prompt';

export type Confidence = 'answered' | 'insufficient' | 'no_knowledge';

export interface GenerateOutput {
  logId: string;
  reply: string;
  confidence: Confidence;
  needsHumanReview: boolean;
  retrieval: {
    method: RetrievalMethod;
    entries: Array<RetrievedEntry & { relevant: boolean }>;
  };
  model: string;
  devFallback: boolean;
}

interface ConversationRow {
  id: string;
  brand_id: string;
  brand_name: string;
  customer_name: string;
  order_id: string | null;
  status: string;
}

/**
 * Full generate pipeline:
 *  1. Load the conversation (brand determined from the trusted DB record).
 *  2. Find the latest customer message.
 *  3. Brand-scoped retrieval (vector w/ keyword fallback).
 *  4. Build a constrained prompt and call the LLM.
 *  5. Apply guardrails to derive a confidence signal.
 *  6. Persist an ai_reply_logs audit row (GENERATED or FAILED).
 */
export async function runGenerate(conversationId: string): Promise<GenerateOutput> {
  const conversation = await loadConversation(conversationId);
  if (!conversation) {
    throw new HttpError(404, 'Conversation not found');
  }

  const latestCustomer = await latestCustomerMessage(conversationId);
  if (!latestCustomer) {
    throw new HttpError(400, 'No customer message to respond to in this conversation');
  }

  // Retrieval is always scoped to the conversation's brand (never user-supplied).
  const retrieval = await retrieveKnowledge(conversation.brand_id, latestCustomer);

  const history = await recentHistory(conversationId);

  const promptInput: PromptInput = {
    brandName: conversation.brand_name,
    customerName: conversation.customer_name,
    orderId: conversation.order_id,
    orderStatus: conversation.status,
    latestCustomerMessage: latestCustomer,
    history,
    policies: retrieval.relevant
  };

  const started = Date.now();
  try {
    const llm = await generateReply(promptInput);
    const confidence = deriveConfidence(retrieval.method, retrieval.relevant.length, llm.canAnswer);
    const needsHumanReview = confidence !== 'answered';
    const latency = Date.now() - started;

    const logId = await insertLog({
      conversationId,
      brandId: conversation.brand_id,
      customerMessage: latestCustomer,
      retrieval,
      generated: llm.reply,
      status: 'GENERATED',
      confidence,
      model: llm.model,
      latencyMs: latency,
      error: null
    });

    return {
      logId,
      reply: llm.reply,
      confidence,
      needsHumanReview,
      retrieval: {
        method: retrieval.method,
        entries: retrieval.entries.map((e) => ({
          ...e,
          relevant: retrieval.relevant.some((r) => r.id === e.id)
        }))
      },
      model: llm.model,
      devFallback: llm.devFallback
    };
  } catch (err) {
    // Log the failure so the audit trail records what the agent experienced.
    await insertLog({
      conversationId,
      brandId: conversation.brand_id,
      customerMessage: latestCustomer,
      retrieval,
      generated: null,
      status: 'FAILED',
      confidence: deriveConfidence(retrieval.method, retrieval.relevant.length, false),
      model: env.nvidia.model,
      latencyMs: Date.now() - started,
      error: (err as Error).message
    });
    throw err;
  }
}

function deriveConfidence(
  method: RetrievalMethod,
  relevantCount: number,
  canAnswer: boolean
): Confidence {
  if (relevantCount === 0) return method === 'none' ? 'no_knowledge' : 'insufficient';
  if (!canAnswer) return 'insufficient';
  return 'answered';
}

async function loadConversation(id: string): Promise<ConversationRow | null> {
  const { rows } = await pool.query(
    `SELECT c.id, c.brand_id, c.order_id, c.status,
            b.name AS brand_name, cu.name AS customer_name
       FROM conversations c
       JOIN brands b ON b.id = c.brand_id
       JOIN customers cu ON cu.id = c.customer_id
      WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function latestCustomerMessage(conversationId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT content FROM messages
      WHERE conversation_id = $1 AND sender_type = 'CUSTOMER'
      ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );
  return rows[0]?.content || null;
}

async function recentHistory(conversationId: string) {
  const { rows } = await pool.query(
    `SELECT sender_type, content FROM (
        SELECT sender_type, content, created_at FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [conversationId, env.retrieval.historyLimit]
  );
  return rows;
}

interface InsertLogArgs {
  conversationId: string;
  brandId: string;
  customerMessage: string;
  retrieval: { method: RetrievalMethod; entries: RetrievedEntry[]; relevant: RetrievedEntry[] };
  generated: string | null;
  status: string;
  confidence: Confidence;
  model: string;
  latencyMs: number;
  error: string | null;
}

async function insertLog(a: InsertLogArgs): Promise<string> {
  const context = {
    method: a.retrieval.method,
    retrieved: a.retrieval.entries.map((e) => ({
      id: e.id,
      category: e.category,
      title: e.title,
      content: e.content,
      score: e.score,
      relevant: a.retrieval.relevant.some((r) => r.id === e.id)
    }))
  };
  const { rows } = await pool.query(
    `INSERT INTO ai_reply_logs
       (conversation_id, brand_id, customer_message, retrieved_context,
        generated_response, status, retrieval_method, model, confidence, latency_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      a.conversationId,
      a.brandId,
      a.customerMessage,
      JSON.stringify(context),
      a.generated,
      a.status,
      a.retrieval.method,
      a.model,
      a.confidence,
      a.latencyMs,
      a.error
    ]
  );
  return rows[0].id;
}

/** Small typed error so routes can map to HTTP status codes. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

// ---------------------------------------------------------------------------
// Reply lifecycle: edit -> approve -> send, plus audit log reads
// ---------------------------------------------------------------------------

export interface AiLog {
  id: string;
  conversation_id: string;
  brand_id: string;
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

async function getLog(logId: string): Promise<AiLog | null> {
  const { rows } = await pool.query('SELECT * FROM ai_reply_logs WHERE id = $1', [logId]);
  return rows[0] || null;
}

/** Save an agent edit and/or move the draft to EDITED/APPROVED. */
export async function updateLog(
  logId: string,
  opts: { agentEditedResponse?: string; status?: 'EDITED' | 'APPROVED' }
): Promise<AiLog> {
  const log = await getLog(logId);
  if (!log) throw new HttpError(404, 'AI log not found');
  if (log.status === 'SENT') throw new HttpError(409, 'This reply was already sent and cannot be changed');

  const edited = opts.agentEditedResponse?.trim();
  // Decide the status: explicit > edited > unchanged.
  const nextStatus = opts.status || (edited !== undefined ? 'EDITED' : log.status);

  const { rows } = await pool.query(
    `UPDATE ai_reply_logs
        SET agent_edited_response = COALESCE($2, agent_edited_response),
            status = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [logId, edited ?? null, nextStatus]
  );
  return rows[0];
}

/**
 * Send the (possibly edited) reply into the conversation as an AGENT message.
 * Idempotent: if the log is already SENT, returns the existing outcome without
 * inserting a duplicate message.
 */
export async function sendReply(
  logId: string,
  finalContent: string
): Promise<{ alreadySent: boolean; message: any; log: AiLog }> {
  const content = finalContent?.trim();
  if (!content) throw new HttpError(400, 'content is required to send');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the log row to serialise concurrent send attempts (double-click).
    const { rows: logRows } = await client.query(
      'SELECT * FROM ai_reply_logs WHERE id = $1 FOR UPDATE',
      [logId]
    );
    const log = logRows[0] as AiLog | undefined;
    if (!log) {
      await client.query('ROLLBACK');
      throw new HttpError(404, 'AI log not found');
    }

    if (log.status === 'SENT') {
      // Idempotent: find the message we already inserted for this final response.
      const { rows: existing } = await client.query(
        `SELECT * FROM messages
          WHERE conversation_id = $1 AND sender_type = 'AGENT' AND content = $2
          ORDER BY created_at DESC LIMIT 1`,
        [log.conversation_id, log.final_response]
      );
      await client.query('COMMIT');
      return { alreadySent: true, message: existing[0] || null, log };
    }

    const { rows: msgRows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_type, content)
       VALUES ($1, 'AGENT', $2)
       RETURNING id, conversation_id, sender_type, content, created_at`,
      [log.conversation_id, content]
    );

    const { rows: updated } = await client.query(
      `UPDATE ai_reply_logs
          SET final_response = $2, status = 'SENT', updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [logId, content]
    );

    await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [
      log.conversation_id
    ]);

    await client.query('COMMIT');
    return { alreadySent: false, message: msgRows[0], log: updated[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listLogsForConversation(conversationId: string): Promise<AiLog[]> {
  const { rows } = await pool.query(
    'SELECT * FROM ai_reply_logs WHERE conversation_id = $1 ORDER BY created_at DESC',
    [conversationId]
  );
  return rows;
}

export async function listRecentLogs(limit = 100, brandIds?: string[]): Promise<AiLog[]> {
  const scoped = Array.isArray(brandIds);
  const { rows } = await pool.query(
    `SELECT l.*, b.name AS brand_name
       FROM ai_reply_logs l
       JOIN brands b ON b.id = l.brand_id
      ${scoped ? 'WHERE l.brand_id = ANY($2::uuid[])' : ''}
      ORDER BY l.created_at DESC LIMIT $1`,
    scoped ? [limit, brandIds] : [limit]
  );
  return rows;
}
