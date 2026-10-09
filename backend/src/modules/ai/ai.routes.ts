import { Router } from 'express';
import {
  runGenerate,
  updateLog,
  sendReply,
  listLogsForConversation,
  listRecentLogs,
  HttpError
} from './ai.service';
import {
  requireBrandAccess,
  brandFromConversation,
  brandFromAiLog
} from '../../middleware/auth';
import { env } from '../../config/env';

const router = Router();

/** Generate an AI reply draft for a conversation's latest customer message. */
router.post(
  '/conversations/:id/generate',
  requireBrandAccess(brandFromConversation),
  async (req, res, next) => {
    try {
      res.json(await runGenerate(String(req.params.id)));
    } catch (err) {
      next(err);
    }
  }
);

/** Save an agent edit and/or transition status (EDITED | APPROVED). */
router.patch('/ai-logs/:logId', requireBrandAccess(brandFromAiLog), async (req, res, next) => {
  try {
    const { agentEditedResponse, status } = req.body ?? {};
    if (status && !['EDITED', 'APPROVED'].includes(status)) {
      throw new HttpError(400, 'status must be EDITED or APPROVED');
    }
    res.json(await updateLog(String(req.params.logId), { agentEditedResponse, status }));
  } catch (err) {
    next(err);
  }
});

/** Send the final reply into the conversation (idempotent). */
router.post('/ai-logs/:logId/send', requireBrandAccess(brandFromAiLog), async (req, res, next) => {
  try {
    const result = await sendReply(String(req.params.logId), (req.body ?? {}).content);
    res.status(result.alreadySent ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

/** Audit trail for one conversation. */
router.get(
  '/conversations/:id/logs',
  requireBrandAccess(brandFromConversation),
  async (req, res, next) => {
    try {
      res.json(await listLogsForConversation(String(req.params.id)));
    } catch (err) {
      next(err);
    }
  }
);

/** Global recent logs (audit view), scoped to the agent's brands. */
router.get('/ai-logs', async (req, res, next) => {
  try {
    const brandIds =
      env.auth.enabled && req.agent && !req.agent.isAdmin ? req.agent.brandIds : undefined;
    res.json(await listRecentLogs(100, brandIds));
  } catch (err) {
    next(err);
  }
});

export default router;
