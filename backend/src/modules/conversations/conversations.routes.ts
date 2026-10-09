import { Router } from 'express';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { requireBrandAccess, brandFromConversation } from '../../middleware/auth';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    // Scope the list to the agent's brands (admins see all).
    const scoped = env.auth.enabled && req.agent && !req.agent.isAdmin;
    const result = await pool.query(
      `
      SELECT
        c.id, c.order_id, c.status, c.brand_id,
        b.name AS brand_name,
        cu.name AS customer_name,
        cu.email AS customer_email,
        c.created_at, c.updated_at
      FROM conversations c
      JOIN brands b ON b.id = c.brand_id
      JOIN customers cu ON cu.id = c.customer_id
      ${scoped ? 'WHERE c.brand_id = ANY($1::uuid[])' : ''}
      ORDER BY c.updated_at DESC
    `,
      scoped ? [req.agent!.brandIds] : []
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireBrandAccess(brandFromConversation), async (req, res, next) => {
  try {
    const conversation = await pool.query(`
      SELECT
        c.id,
        c.order_id,
        c.status,
        c.brand_id,
        b.name AS brand_name,
        cu.id AS customer_id,
        cu.name AS customer_name,
        cu.email AS customer_email
      FROM conversations c
      JOIN brands b ON b.id = c.brand_id
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.id = $1
    `, [req.params.id]);

    if (!conversation.rows[0]) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await pool.query(`
      SELECT id, sender_type, content, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [req.params.id]);

    res.json({
      ...conversation.rows[0],
      messages: messages.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/messages', requireBrandAccess(brandFromConversation), async (req, res, next) => {
  try {
    const { senderType, content } = req.body;

    if (!['CUSTOMER', 'AGENT'].includes(senderType)) {
      return res.status(400).json({ error: 'senderType must be CUSTOMER or AGENT' });
    }

    if (!content?.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const conversation = await pool.query(
      'SELECT id FROM conversations WHERE id = $1',
      [req.params.id]
    );

    if (!conversation.rows[0]) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Idempotency guard: a retried submit or double-click that sends the same
    // sender + content within a short window returns the existing message
    // instead of inserting a duplicate.
    const recent = await pool.query(
      `SELECT id, conversation_id, sender_type, content, created_at
         FROM messages
        WHERE conversation_id = $1 AND sender_type = $2 AND content = $3
          AND created_at > NOW() - INTERVAL '10 seconds'
        ORDER BY created_at DESC LIMIT 1`,
      [req.params.id, senderType, content.trim()]
    );
    if (recent.rows[0]) {
      return res.status(200).json(recent.rows[0]);
    }

    const result = await pool.query(`
      INSERT INTO messages (conversation_id, sender_type, content)
      VALUES ($1, $2, $3)
      RETURNING id, conversation_id, sender_type, content, created_at
    `, [req.params.id, senderType, content.trim()]);

    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
