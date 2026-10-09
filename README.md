# AI-Powered CX Reply Assistant

An AI copilot that helps a customer-support agent draft **grounded, brand-safe** replies.
It retrieves the correct brand's policies, drafts a response with an LLM, shows the agent
exactly which knowledge was used, and lets the agent edit / regenerate / approve / send —
with guardrails that stop it from inventing refunds, dates, or promises.

Built for the Datastraw Tech Lead assessment.

---

## What it does

- **Conversation workspace** — customer, brand, order, full message history, latest message.
- **Customer ⇄ Agent simulation** — post as the customer, switch to agent, generate a reply, send it back into the thread. No real WhatsApp/email; sends are simulated and clearly labeled.
- **Brand knowledge base** — two brands with meaningfully different policies; full create/edit/delete UI per brand. No SQL needed to change a policy and re-test the AI.
- **AI reply generation** — brand-scoped retrieval → constrained prompt → LLM → editable draft, shown alongside the retrieved context and a confidence signal.
- **Guardrails** — similarity threshold, no-knowledge fallback ("I can't confirm that from policy, let me verify"), and prompt rules that treat retrieved text + customer messages as untrusted data.
- **Audit log** — every generation stores the customer message, retrieved context, AI draft, agent edit, final sent text, status, model, latency, and errors.

---

## Architecture (current build)

```
React + Vite (TS)  ──REST──▶  Express + TS (node-postgres)  ──SQL──▶  PostgreSQL + pgvector
                                     │
                                     ├── retrieval: brand-scoped pgvector (cosine) + keyword (tsvector) fallback
                                     ├── embeddings: OpenAI-compatible (1536-dim)
                                     └── LLM: OpenRouter (OpenAI-compatible chat)
```

The brand (tenant) boundary is **always enforced in SQL** — retrieval filters by `brand_id`
before ranking, so the LLM is never trusted to pick the tenant. See [docs/architecture.md](docs/architecture.md)
for the scale-out design (500 brands / 5k agents).

### Folder structure

```
cx-reply-assistant/
├── backend/
│   └── src/
│       ├── app.ts                 # express app + route mounting
│       ├── server.ts              # entrypoint
│       ├── config/                # env.ts (validated env), database.ts (pg pool)
│       ├── middleware/            # centralized error handler
│       ├── utils/                 # http.ts (timeout fetch + typed errors)
│       ├── services/              # embeddings, retrieval, prompt, llm
│       └── modules/               # brands / conversations / knowledge / ai (routes + service)
├── frontend/
│   └── src/
│       ├── App.tsx                # shell + tab nav
│       ├── api.ts                 # typed API client
│       └── components/            # Workspace, AssistantPanel, KnowledgeBase, LogsView
├── database/
│   ├── schema.sql                 # tables + extensions
│   ├── seed.sql                   # 2 brands, policies, conversations
│   └── migrations/001_ai_layer.sql
└── docs/architecture.md
```

### Data model

| Table | Purpose |
|-------|---------|
| `brands` | Tenant. |
| `customers` | Customer identity. |
| `conversations` | Belongs to a brand + customer; carries `order_id`, `status`. |
| `messages` | `CUSTOMER` / `AGENT` / `AI` messages in a conversation. |
| `kb_entries` | Brand-scoped policy entries; `category`, `title`, `content`, `embedding vector(1536)`, `search_tsv` (generated), `embedding_updated_at`. |
| `ai_reply_logs` | Audit trail: customer message, retrieved context (JSONB), generated/edited/final response, status, confidence, retrieval method, model, latency, error. |

Status lifecycle: `GENERATED → EDITED → APPROVED → SENT` (or `FAILED`).

---

## Prerequisites

- **Node.js 18+**
- **PostgreSQL 14+ with the `pgvector` extension**
  - Local Windows (PG18) without a compiler: a prebuilt `vector.dll` works — copy `vector.dll` into `…\PostgreSQL\18\lib\` and `vector*` into `…\share\extension\`, then `CREATE EXTENSION vector;`.
  - Supabase: pgvector is built in — just `create extension vector;`.
- Optional (for live AI): an **OpenRouter** API key and an **embedding** provider key (OpenAI / DeepInfra, 1536-dim).

> The app runs fully **without** AI keys: retrieval uses the keyword path and generation uses a clearly-labeled deterministic dev draft. Add keys to enable semantic retrieval + real LLM replies.

---

## Setup

### 1. Database

```bash
createdb cx_reply_assistant         # or create it in your SQL client
psql -d cx_reply_assistant -f database/schema.sql
psql -d cx_reply_assistant -f database/seed.sql
psql -d cx_reply_assistant -f database/migrations/001_ai_layer.sql
psql -d cx_reply_assistant -f database/migrations/002_auth.sql
```

(`schema.sql` runs `CREATE EXTENSION IF NOT EXISTS vector;` — the extension must be installed.)

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env     # then fill in DB + (optional) AI keys
npm run dev              # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

---

## Environment variables (`backend/.env`)

See [backend/.env.example](backend/.env.example). Database can be configured **two ways**:

**Discrete vars (recommended locally — no URL-encoding):**
```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=cx_reply_assistant
```

**Or a single URL (recommended for Supabase):**
```
DATABASE_URL=postgresql://user:pass@host:5432/db   # SSL auto-enabled for supabase/render/neon
```

AI (optional — app degrades gracefully without them):
```
OPENROUTER_API_KEY=...      OPENROUTER_MODEL=openai/gpt-4o-mini
EMBEDDING_API_KEY=...        EMBEDDING_MODEL=text-embedding-3-small    EMBEDDING_BASE_URL=https://api.openai.com/v1
```

Tuning (optional): `RETRIEVAL_MIN_SIMILARITY` (default 0.3), `RETRIEVAL_MAX_RESULTS` (4), `RETRIEVAL_HISTORY_LIMIT` (8), `AI_TIMEOUT_MS` (20000), `ALLOW_DEV_FALLBACK` (true).

---

## Demo authentication

The API is protected by a lightweight **demo auth** layer (set `AUTH_ENABLED=false` to disable).
Two seeded agents demonstrate brand authorization:

| Agent | Access |
|-------|--------|
| **Sam Rivera** (admin) | all brands |
| **Alex Chen** | Acme Drinks only |

Sign in by picking an agent — no password. Log in as **Alex** and you'll only see Acme;
trying to generate a reply or read the KB for FreshBottle returns **403**. This is where
tenant isolation is enforced (server-side, per request) — not in the LLM.

## Try it (end-to-end)

1. Sign in (pick an agent). Open the **Workspace**. Pick a conversation.
2. In the composer, keep the toggle on **Customer**, type a question (e.g. *"Can I cancel my order?"*), Send.
3. In the **AI Assistant** panel click **Generate Reply** — see the draft, the retrieved policy, and the confidence banner.
4. Edit if needed → **Approve** → **Send**. The reply appears in the thread.
5. Open **Knowledge Base**, change a policy (e.g. FreshBottle's refund window), and regenerate to see the AI follow the new policy.
6. Open **Logs** to inspect the full audit trail.

**Guardrail demo:** ask something with no matching policy (e.g. *"Do you ship to Antarctica?"*). The assistant returns a safe "I can't confirm that from policy" reply and flags it for human review instead of inventing an answer.

**Brand isolation demo:** the same shipping question returns *3–5 days* for Acme Drinks and *2–4 days* for FreshBottle — never the other brand's policy.

---

## Testing

```bash
cd backend && npm test
```

Covers brand isolation, similarity threshold / no-result fallback, correct brand context to the LLM (mocked), and the reply lifecycle incl. duplicate-send prevention. External AI providers are mocked.

---

## Deployment

- **Frontend → Vercel** (set `VITE_API_URL` to the backend URL).
- **Backend → Render** (or any Node host): set env vars, `npm run build`, `npm start`.
- **Database → Supabase**: run `schema.sql` + migration, `create extension vector;`, set `DATABASE_URL`.

CORS is restricted to `FRONTEND_URL`. See [docs/architecture.md](docs/architecture.md).

---

## Security notes

- Service-role / provider keys live only on the backend; never shipped to the browser.
- All SQL is parameterized (`pg` placeholders).
- Retrieved documents and customer messages are treated as untrusted data in the prompt.
- Demo auth is intentionally minimal; the production auth/brand-authorization design is in the architecture doc.

## Known limitations / future work

- Auth is a demo stub (not full Supabase Auth) — see architecture doc for the real design.
- Semantic retrieval needs an embedding key; without it the keyword path is used.
- Single Node process; the scale-out design (queues, caching, workers) is documented, not built.
