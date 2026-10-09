import { Router } from 'express';
import { issueToken, loadAgent, listAgents } from '../../services/auth';

const router = Router();

/** Demo login picker — lists the seeded agents and their brand access. */
router.get('/agents', async (_req, res, next) => {
  try {
    res.json(await listAgents());
  } catch (err) {
    next(err);
  }
});

/**
 * Demo login. In a real system this would verify a password / Supabase session;
 * here, selecting a seeded agent issues a signed token carrying their brand
 * memberships. Clearly development-only.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { agentId } = req.body ?? {};
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const agent = await loadAgent(agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const token = issueToken(agent);
    res.json({ token, agent });
  } catch (err) {
    next(err);
  }
});

export default router;
