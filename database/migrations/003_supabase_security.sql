-- Migration 003: Supabase Data API hardening.
-- This app accesses tables through its Express backend using DATABASE_URL;
-- it does not need anon/authenticated browser clients to query these tables.
-- Enable RLS and remove table grants for PUBLIC/anon/authenticated. The backend
-- connects as the database owner and continues to perform app queries.
SET search_path = public, extensions;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reply_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_brands ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.brands,
  public.customers,
  public.conversations,
  public.messages,
  public.kb_entries,
  public.ai_reply_logs,
  public.agents,
  public.agent_brands
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.brands, public.customers, public.conversations, public.messages, public.kb_entries, public.ai_reply_logs, public.agents, public.agent_brands FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.brands, public.customers, public.conversations, public.messages, public.kb_entries, public.ai_reply_logs, public.agents, public.agent_brands FROM authenticated';
  END IF;
END $$;
