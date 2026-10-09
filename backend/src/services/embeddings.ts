import { env, hasEmbeddings } from '../config/env';
import { fetchWithTimeout, ExternalServiceError } from '../utils/http';

/**
 * Generate a single embedding vector for a piece of text.
 * Uses an OpenAI-compatible /embeddings endpoint.
 *
 * Returns null when no embedding provider is configured — callers must then
 * fall back to keyword retrieval rather than failing.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!hasEmbeddings()) return null;

  const res = await fetchWithTimeout(
    `${env.embedding.baseUrl}/embeddings`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.embedding.apiKey}`
      },
      body: JSON.stringify({
        model: env.embedding.model,
        input: text.slice(0, 8000) // guard against oversized input
      })
    },
    env.aiTimeoutMs
  );

  if (!res.ok) {
    const detail = await safeText(res);
    throw new ExternalServiceError(`Embedding provider returned ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const vector = data.data?.[0]?.embedding;

  if (!vector || !Array.isArray(vector)) {
    throw new ExternalServiceError('Embedding provider returned no vector');
  }
  if (vector.length !== env.embedding.dimensions) {
    throw new ExternalServiceError(
      `Embedding dimension mismatch: got ${vector.length}, expected ${env.embedding.dimensions}. ` +
        `Check EMBEDDING_MODEL matches the schema VECTOR(${env.embedding.dimensions}).`
    );
  }
  return vector;
}

/** pgvector accepts a vector literal like '[0.1,0.2,...]'. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
