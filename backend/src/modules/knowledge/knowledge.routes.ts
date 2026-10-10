import { Router } from 'express';
import { hasPgvector, pool } from '../../config/database';
import { embedText, toVectorLiteral } from '../../services/embeddings';
import { requireBrandAccess, brandFromParam, brandFromKbEntry } from '../../middleware/auth';

const router = Router();

const categories = ['RETURN', 'REFUND', 'SHIPPING', 'CANCELLATION', 'GENERAL'];

/**
 * Best-effort embedding refresh for a KB row.
 * Never throws — if the embedding provider is missing or fails, the row keeps
 * working via the keyword retrieval path and simply has a stale/empty embedding.
 */
async function refreshEmbedding(id: string, title: string, content: string): Promise<void> {
  if (!(await hasPgvector())) return;
  try {
    const vec = await embedText(`${title}\n${content}`);
    if (!vec) return; // no provider configured
    await pool.query(
      `UPDATE kb_entries
          SET embedding = $2::vector, embedding_updated_at = NOW()
        WHERE id = $1`,
      [id, toVectorLiteral(vec)]
    );
  } catch (err) {
    console.error(`Embedding refresh failed for kb_entry ${id}:`, (err as Error).message);
  }
}

router.get('/brands/:brandId/knowledge', requireBrandAccess(brandFromParam('brandId')), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, brand_id, category, title, content,
              (embedding IS NOT NULL) AS has_embedding,
              embedding_updated_at, created_at, updated_at
         FROM kb_entries
        WHERE brand_id = $1
        ORDER BY category, title`,
      [req.params.brandId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/brands/:brandId/knowledge', requireBrandAccess(brandFromParam('brandId')), async (req, res, next) => {
  try {
    const { category, title, content } = req.body ?? {};

    if (!categories.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${categories.join(', ')}` });
    }
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const result = await pool.query(
      `INSERT INTO kb_entries (brand_id, category, title, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, brand_id, category, title, content, created_at, updated_at`,
      [req.params.brandId, category, title.trim(), content.trim()]
    );

    const entry = result.rows[0];
    await refreshEmbedding(entry.id, entry.title, entry.content);

    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

router.put('/knowledge/:id', requireBrandAccess(brandFromKbEntry), async (req, res, next) => {
  try {
    const { category, title, content } = req.body ?? {};

    if (!categories.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${categories.join(', ')}` });
    }
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    // Changing content invalidates the old embedding, so clear it first; the
    // refresh below regenerates it. If the provider is down the row still works
    // via keyword search and will be re-embedded on the next successful edit.
    const result = await pool.query(
      `UPDATE kb_entries
          SET category = $1, title = $2, content = $3,
              embedding = NULL, embedding_updated_at = NULL, updated_at = NOW()
        WHERE id = $4
        RETURNING id, brand_id, category, title, content, created_at, updated_at`,
      [category, title.trim(), content.trim(), req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }

    const entry = result.rows[0];
    await refreshEmbedding(entry.id, entry.title, entry.content);

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

router.delete('/knowledge/:id', requireBrandAccess(brandFromKbEntry), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM kb_entries WHERE id = $1 RETURNING id', [
      req.params.id
    ]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
