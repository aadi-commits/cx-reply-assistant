import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { verifyToken, canAccessBrand, AgentPrincipal } from '../services/auth';
import { pool } from '../config/database';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      agent?: AgentPrincipal;
    }
  }
}

/** Require a valid agent token. No-op when AUTH_ENABLED=false (open demo mode). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.auth.enabled) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const principal = token ? verifyToken(token) : null;

  if (!principal) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.agent = principal;
  next();
}

/**
 * Enforce brand authorization. Resolves the target brand via `resolver`
 * (different routes carry the brand differently) and 403s if the agent lacks
 * access. This is where tenant isolation is enforced for brand-scoped actions.
 */
export function requireBrandAccess(resolver: (req: Request) => Promise<string | null> | string | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!env.auth.enabled) return next();
    if (!req.agent) return res.status(401).json({ error: 'Authentication required' });

    try {
      const brandId = await resolver(req);
      if (!brandId) return res.status(404).json({ error: 'Target not found' });
      if (!canAccessBrand(req.agent, brandId)) {
        return res.status(403).json({ error: 'You do not have access to this brand' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ---- Brand resolvers for each brand-scoped route ---------------------------

export const brandFromParam = (param: string) => (req: Request): string | null => {
  const v = req.params[param];
  return typeof v === 'string' ? v : null;
};

export const brandFromConversation = async (req: Request): Promise<string | null> => {
  const { rows } = await pool.query('SELECT brand_id FROM conversations WHERE id = $1', [
    req.params.id
  ]);
  return rows[0]?.brand_id ?? null;
};

export const brandFromKbEntry = async (req: Request): Promise<string | null> => {
  const { rows } = await pool.query('SELECT brand_id FROM kb_entries WHERE id = $1', [
    req.params.id
  ]);
  return rows[0]?.brand_id ?? null;
};

export const brandFromAiLog = async (req: Request): Promise<string | null> => {
  const { rows } = await pool.query('SELECT brand_id FROM ai_reply_logs WHERE id = $1', [
    req.params.logId
  ]);
  return rows[0]?.brand_id ?? null;
};
