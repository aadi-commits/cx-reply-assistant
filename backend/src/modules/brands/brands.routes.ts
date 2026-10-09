import { Router } from 'express';
import { pool } from '../../config/database';
import { env } from '../../config/env';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    // Non-admin agents only see brands they are a member of.
    if (env.auth.enabled && req.agent && !req.agent.isAdmin) {
      const result = await pool.query(
        `SELECT id, name, created_at, updated_at
           FROM brands
          WHERE id = ANY($1::uuid[])
          ORDER BY name`,
        [req.agent.brandIds]
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      'SELECT id, name, created_at, updated_at FROM brands ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
