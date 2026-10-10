import { env, hasLlm } from '../config/env';
import { fetchWithTimeout, ExternalServiceError } from '../utils/http';
import { SYSTEM_PROMPT, buildUserMessage, PromptInput } from './prompt';

export interface LlmReply {
  reply: string;
  canAnswer: boolean;
  model: string;
  /** true when produced by the labeled dev fallback (no API key configured) */
  devFallback: boolean;
}

/**
 * Generate a reply draft. When NVIDIA_API_KEY is set, calls NVIDIA NIM.
 * Otherwise returns a clearly-labeled deterministic dev draft so the full
 * loop remains testable without credentials.
 */
export async function generateReply(input: PromptInput): Promise<LlmReply> {
  if (!hasLlm()) {
    if (!env.allowDevFallback) {
      throw new ExternalServiceError('No LLM configured (set NVIDIA_API_KEY in backend/.env).');
    }
    return devDraft(input);
  }

  const res = await fetchWithTimeout(
    `${env.nvidia.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.nvidia.apiKey}`
      },
      body: JSON.stringify({
        model: env.nvidia.model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(input) }
        ]
      })
    },
    env.aiTimeoutMs
  );

  if (!res.ok) {
    const detail = await safeText(res);
    throw new ExternalServiceError(`NVIDIA NIM returned ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ExternalServiceError('NVIDIA NIM returned an empty response');
  }

  const parsed = parseModelJson(content);
  return {
    reply: parsed.reply,
    canAnswer: parsed.canAnswer,
    model: env.nvidia.model,
    devFallback: false
  };
}

/** Tolerant JSON parse — some models wrap JSON in prose or code fences. */
function parseModelJson(raw: string): { reply: string; canAnswer: boolean } {
  const tryParse = (s: string) => {
    const obj = JSON.parse(s);
    if (typeof obj.reply === 'string') {
      return { reply: obj.reply.trim(), canAnswer: obj.can_answer !== false };
    }
    return null;
  };
  try {
    const r = tryParse(raw);
    if (r) return r;
  } catch {
    /* fall through */
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const r = tryParse(match[0]);
      if (r) return r;
    } catch {
      /* fall through */
    }
  }
  // Could not parse structured output — treat the text as the reply but mark
  // it low-confidence so the agent reviews carefully.
  throw new ExternalServiceError('Model response was not valid JSON');
}

/** Deterministic, clearly-labeled draft used only when no API key is set. */
function devDraft(input: PromptInput): LlmReply {
  const canAnswer = input.policies.length > 0;
  const body = canAnswer
    ? `Hi ${firstName(input.customerName)}, thanks for reaching out. Based on our policy: ` +
      `"${input.policies[0].content}" Please let me know if you'd like me to help with the next step.`
    : `Hi ${firstName(input.customerName)}, thanks for reaching out. I want to make sure I give you ` +
      `the correct information, so let me check the details on this and get back to you shortly.`;

  return {
    reply: `[DEV DRAFT — no LLM key configured] ${body}`,
    canAnswer,
    model: 'dev-fallback',
    devFallback: true
  };
}

function firstName(name: string): string {
  return name.split(' ')[0] || 'there';
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
