import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
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

// In production, Render serves the built React app and API from one service.
// In local development, Vite serves the frontend separately, so this directory
// may not exist and the backend simply remains an API server.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use(errorHandler);
