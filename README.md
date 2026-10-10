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
                                     └── LLM: NVIDIA NIM (OpenAI-compatible chat)
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

- **Node.js 20 LTS or newer** (18+ may work, but Node 20+ is recommended).
- **For local development:** PostgreSQL 14+ installed and running locally. The local template expects user `postgres`, password `2301`, port `5432` (edit `backend/.env` if needed). The installer does not change the password stored in PostgreSQL.
- **For hosted deployment:** a Supabase project and its Session pooler URI, stored as `DATABASE_URL` on the backend only.
- Optional for live AI: an **NVIDIA API key** from NVIDIA Build. Optional semantic retrieval requires an embeddings API key whose model returns **1536 dimensions**.

The app can run without provider keys: it uses keyword retrieval and a clearly labeled development draft. Add an NVIDIA API key for real AI-generated replies. If `pgvector` is unavailable in the local PostgreSQL installation, initialization automatically uses a JSONB placeholder column and keyword retrieval instead of failing. Semantic/vector retrieval is enabled when pgvector is available and installed for this database.

---

## Quick setup on Windows

1. Extract the ZIP to a writable folder.
2. Make sure PostgreSQL is installed and running, and the `postgres` user can connect with password `2301` (or update `backend/.env`).
3. Double-click **`INSTALL_AND_RUN.bat`** (or **`RUN.bat`**). The script installs backend and frontend dependencies, creates `cx_reply_assistant` if needed, applies the schema and migrations, seeds demo records, and opens the backend and frontend in separate terminal windows. It then opens `http://localhost:5173`.
4. To enable real AI, double-click **`CONFIGURE_AI_KEYS.bat`** and enter your key in `backend/.env`. Restart the backend terminal afterward.

### AI key setup

- **AI replies:** put your NVIDIA key after `NVIDIA_API_KEY=`. The default endpoint is `https://integrate.api.nvidia.com/v1` and the default model is `openai/gpt-oss-20b`; change `NVIDIA_MODEL` to a model enabled for your NVIDIA account if needed. Keys are stored on the backend only. Run `TEST_NVIDIA_API.bat` to verify the key and model.
- **Semantic search (optional):** configure `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, and `EMBEDDING_BASE_URL`. The default settings target OpenAI's compatible endpoint with `text-embedding-3-small` (1536 dimensions). If you do not configure it, keyword retrieval remains active.
- Never paste provider keys into `frontend/.env`; frontend variables are browser-visible.

## Manual setup

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
# Set local database credentials and optional AI keys in .env
npm run db:init         # creates database, applies schema + migrations + seeds
npm run dev             # http://localhost:4000
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
PGPASSWORD=2301
PGDATABASE=cx_reply_assistant
```

**Or a single URL (recommended for Supabase; takes priority when non-empty):**
```
DATABASE_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_DB_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```
Copy the real URI from Supabase Dashboard > Connect > Session pooler. The host and username must come from the dashboard; reserved characters in the password must be URL-encoded. See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

AI (optional — app degrades gracefully without them):
```
NVIDIA_API_KEY=...          NVIDIA_MODEL=openai/gpt-oss-20b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
EMBEDDING_API_KEY=...        EMBEDDING_MODEL=text-embedding-3-small    EMBEDDING_BASE_URL=https://api.openai.com/v1
```

Tuning (optional): `RETRIEVAL_MIN_SIMILARITY` (default 0.3), `RETRIEVAL_MAX_RESULTS` (4), `RETRIEVAL_HISTORY_LIMIT` (8), `AI_TIMEOUT_MS` (20000), `ALLOW_DEV_FALLBACK` (true).

The initializer is idempotent and may be rerun with `npm run db:init`. When pgvector isn't installed, it automatically omits the HNSW index and uses `JSONB` for the unused embedding field; vector retrieval is skipped in that mode.

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

## Deployment (Supabase + Render + Vercel)

### 1. Configure Supabase PostgreSQL

1. Create/open your Supabase project and open **Connect** in the dashboard.
2. Select **Session pooler** and copy the exact URI. Session mode is a good fit for this persistent Express backend and works on IPv4-only hosts; do not invent the pooler hostname or username.
3. Copy `backend/.env.supabase.example` to `backend/.env` (or run `SETUP_SUPABASE.bat`) and set `DATABASE_URL` to the URI from Supabase. Replace the password and URL-encode reserved characters in it. The non-empty `DATABASE_URL` takes priority over the local `PGHOST`/`PGPASSWORD` settings.
4. Run `SETUP_SUPABASE.bat` or run `cd backend && npm ci && npm run db:init`. This creates the application tables, applies all migrations, enables RLS, restricts Data API access to these tables, and inserts demo seed records.
5. If semantic/vector retrieval is desired, enable the **vector** extension in Supabase Dashboard > Database > Extensions. If pgvector is unavailable, keyword retrieval remains enabled.

This project connects to Supabase through server-side PostgreSQL. It does **not** require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or a service-role key in the app: the backend uses `DATABASE_URL`. Never put a database URI, NVIDIA key, or service-role key in `frontend/.env`.

### 2. Deploy the backend to Render

- Create a Web Service from this repository. The included `render.yaml` supplies build/start commands.
- Set `DATABASE_URL` to the same Supabase Session pooler URI, `AUTH_SECRET` to a unique long random secret, `NVIDIA_API_KEY` to your NVIDIA key, and `FRONTEND_URL` to the exact deployed frontend origin (without a trailing slash).
- Keep `ALLOW_DEV_FALLBACK=false` in production so missing AI credentials do not silently produce demo replies.
- After deploying, verify `https://YOUR-BACKEND-URL/api/health` returns JSON with `status: "ok"`.

### 3. Deploy the frontend to Vercel

- Set `VITE_API_URL=https://YOUR-BACKEND-URL/api` in the Vercel project environment variables (see `frontend/.env.production.example`), then redeploy.
- Set the backend's `FRONTEND_URL` to the exact Vercel origin, then redeploy/restart the backend.

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

## Deploy to Render with Supabase and NVIDIA

See [RENDER_DEPLOY.md](RENDER_DEPLOY.md) for the end-to-end Blueprint instructions. The root `render.yaml` deploys one Render web service: it builds both the frontend and backend, initializes the Supabase schema at service startup, and serves the React app plus `/api` from one origin. Set only the `DATABASE_URL` Supabase Session Pooler URI and `NVIDIA_API_KEY` secrets in Render; the Blueprint generates `AUTH_SECRET` automatically.


## Supabase destructive reset and fresh demo data

If the database contains stale demo records, first create a backup in the Supabase dashboard, then extract the complete project ZIP and run `RESET_SUPABASE_AND_RESEED.bat` from the project root on Windows. Do not run the BAT alone from Downloads: it needs the adjacent `backend` and `database` folders plus `backend\.env`. It checks the configured Supabase host, asks you to confirm the host and the destructive action, drops only this application's tables, and runs the initializer to recreate the schema and load synthetic demo data. It deliberately does not drop Supabase-managed `auth`, `storage`, `realtime`, or `extensions` schemas. The reset has not been run against your live database by the project author; review the target host carefully and take a backup first.

The seed data uses fictional customers with reserved `example.test` email addresses, three fictional brands, support-policy knowledge entries, and sample conversations. `Sam Rivera` and `Alex Chen` are demo **agent accounts** shown on the login screen; the customer names shown in the inbox are the people contacting support, so these identities are intentionally different. The data is synthetic and must not be treated as real customer records.
