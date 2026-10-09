import { pool } from '../config/database';
import { env } from '../config/env';
import { embedText, toVectorLiteral } from './embeddings';

export type RetrievalMethod = 'vector' | 'keyword' | 'none';

export interface RetrievedEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  score: number; // cosine similarity (0..1) for vector, ts_rank for keyword
}

export interface RetrievalResult {
  method: RetrievalMethod;
  entries: RetrievedEntry[];
  /** entries that passed the relevance threshold (what we actually trust) */
  relevant: RetrievedEntry[];
}

/**
 * Brand-scoped knowledge retrieval.
 *
 * CRITICAL: brand_id is always filtered in SQL BEFORE ranking, so Brand A's
 * knowledge can never be returned for a Brand B conversation — the LLM is
 * never trusted to enforce the tenant boundary.
 *
 * Strategy:
 *   1. If embeddings are configured, do pgvector cosine similarity search.
 *   2. Otherwise (or if no embedded rows match), fall back to keyword search.
 */
export async function retrieveKnowledge(
  brandId: string,
  query: string
): Promise<RetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) return { method: 'none', entries: [], relevant: [] };

  // --- 1. Vector path -------------------------------------------------------
  let queryVec: number[] | null = null;
  try {
    queryVec = await embedText(trimmed);
  } catch {
    // Embedding provider failed — degrade to keyword search rather than erroring.
    queryVec = null;
  }

  if (queryVec) {
    const vecLiteral = toVectorLiteral(queryVec);
    const { rows } = await pool.query(
      `SELECT id, category, title, content,
              1 - (embedding <=> $2::vector) AS score
         FROM kb_entries
        WHERE brand_id = $1
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT $3`,
      [brandId, vecLiteral, env.retrieval.maxResults]
    );

    if (rows.length > 0) {
      const entries = rows.map(toEntry);
      const relevant = entries.filter((e) => e.score >= env.retrieval.minSimilarity);
      return { method: 'vector', entries, relevant };
    }
    // No embedded rows for this brand yet → fall through to keyword.
  }

  // --- 2. Keyword path (full-text, then ILIKE) ------------------------------
  // plainto_tsquery ANDs every term, which is too strict for a natural-language
  // question ("Can I cancel my order?" would require every word to appear).
  // Rewrite it to OR semantics so any overlapping term matches, then rank.
  const fts = await pool.query(
    `WITH q AS (
       SELECT NULLIF(
                replace(plainto_tsquery('english', $2)::text, ' & ', ' | '),
                ''
              )::tsquery AS tsq
     )
     SELECT k.id, k.category, k.title, k.content,
            ts_rank(k.search_tsv, q.tsq) AS score
       FROM kb_entries k, q
      WHERE k.brand_id = $1
        AND q.tsq IS NOT NULL
        AND k.search_tsv @@ q.tsq
      ORDER BY score DESC
      LIMIT $3`,
    [brandId, trimmed, env.retrieval.maxResults]
  );

  if (fts.rows.length > 0) {
    const entries = fts.rows.map(toEntry);
    return { method: 'keyword', entries, relevant: entries };
  }

  // ILIKE fallback for short / non-stemmed queries.
  const like = await pool.query(
    `SELECT id, category, title, content, 0.1::float AS score
       FROM kb_entries
      WHERE brand_id = $1
        AND (title ILIKE '%' || $2 || '%' OR content ILIKE '%' || $2 || '%')
      LIMIT $3`,
    [brandId, trimmed, env.retrieval.maxResults]
  );

  if (like.rows.length > 0) {
    const entries = like.rows.map(toEntry);
    return { method: 'keyword', entries, relevant: entries };
  }

  return { method: 'none', entries: [], relevant: [] };
}

function toEntry(row: any): RetrievedEntry {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    score: Number(row.score)
  };
}
