import crypto from 'node:crypto';
import { pool } from '../config/database';
import { env } from '../config/env';

/**
 * Demo authentication.
 *
 * Tokens are HMAC-signed payloads (a minimal JWT-shaped scheme) carrying the
 * agent's identity and brand memberships. This is intentionally simple and
 * clearly development-only — production would use Supabase Auth and real
 * sessions. What it DOES demonstrate is the important part: the server, not
 * the client, decides which brands an agent may touch.
 */

export interface AgentPrincipal {
  agentId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  brandIds: string[];
  iat: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', env.auth.secret).update(payloadB64).digest('base64url');
}

export function issueToken(principal: Omit<AgentPrincipal, 'iat'>): string {
  const payload: AgentPrincipal = { ...principal, iat: Date.now() };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyToken(token: string): AgentPrincipal | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64);
  // constant-time comparison
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as AgentPrincipal;
  } catch {
    return null;
  }
}

/** Load an agent + their brand memberships (used at login). */
export async function loadAgent(agentId: string): Promise<Omit<AgentPrincipal, 'iat'> | null> {
  const { rows } = await pool.query(
    `SELECT a.id, a.name, a.email, a.is_admin,
            COALESCE(array_agg(ab.brand_id) FILTER (WHERE ab.brand_id IS NOT NULL), '{}') AS brand_ids
       FROM agents a
       LEFT JOIN agent_brands ab ON ab.agent_id = a.id
      WHERE a.id = $1
      GROUP BY a.id`,
    [agentId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    agentId: row.id,
    name: row.name,
    email: row.email,
    isAdmin: row.is_admin,
    brandIds: row.brand_ids
  };
}

export async function listAgents() {
  const { rows } = await pool.query(
    `SELECT a.id, a.name, a.email, a.is_admin,
            COALESCE(array_agg(b.name ORDER BY b.name) FILTER (WHERE b.name IS NOT NULL), '{}') AS brands
       FROM agents a
       LEFT JOIN agent_brands ab ON ab.agent_id = a.id
       LEFT JOIN brands b ON b.id = ab.brand_id
      GROUP BY a.id
      ORDER BY a.name`
  );
  return rows;
}

/** Authorization check: may this agent act on this brand? */
export function canAccessBrand(principal: AgentPrincipal, brandId: string): boolean {
  return principal.isAdmin || principal.brandIds.includes(brandId);
}
