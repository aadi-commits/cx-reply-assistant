import express from 'express';
import cors from 'cors';
import brandsRouter from './modules/brands/brands.routes';
import conversationsRouter from './modules/conversations/conversations.routes';
import knowledgeRouter from './modules/knowledge/knowledge.routes';
import aiRouter from './modules/ai/ai.routes';
import authRouter from './modules/auth/auth.routes';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import { env } from './config/env';

export const app = express();

app.use(cors({
  origin: env.frontendUrl
}));

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'cx-reply-assistant-api',
    authEnabled: env.auth.enabled
  });
});

// Public: demo login.
app.use('/api/auth', authRouter);

// Protected: everything else requires a valid agent token (when AUTH_ENABLED).
// Brand-level authorization is enforced per-route inside each router.
app.use('/api/brands', requireAuth, brandsRouter);
app.use('/api/conversations', requireAuth, conversationsRouter);
app.use('/api', requireAuth, knowledgeRouter);
app.use('/api', requireAuth, aiRouter);

app.use(errorHandler);
