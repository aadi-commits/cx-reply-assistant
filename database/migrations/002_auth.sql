SET search_path = public, extensions;

-- Migration 002: demo authentication + brand authorization
-- Idempotent. A lightweight, clearly-labeled demo auth model:
--   agents log in and carry brand memberships; the API authorizes every
--   brand-scoped action against those memberships.
--
-- This is NOT production auth (no passwords/sessions/Supabase Auth). It exists
-- to demonstrate WHERE and HOW tenant isolation is enforced. See docs/architecture.md.

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: which brands an agent may access.
CREATE TABLE IF NOT EXISTS agent_brands (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, brand_id)
);

-- ---- Seed two demo agents to show enforcement -----------------------------
-- Sam Rivera: access to ALL brands. Alex Chen: Acme Drinks ONLY.
INSERT INTO agents (name, email, is_admin)
SELECT 'Sam Rivera', 'sam@datastraw.demo', TRUE
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = 'sam@datastraw.demo');

-- Sam -> every brand
INSERT INTO agent_brands (agent_id, brand_id)
SELECT a.id, b.id
FROM agents a CROSS JOIN brands b
WHERE a.email = 'sam@datastraw.demo'
ON CONFLICT DO NOTHING;
