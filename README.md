---
title: Aurelle APAC Intelligence Hub
emoji: 💎
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# Aurelle — APAC Intelligence Hub (React)

A modern **React + FastAPI** rebuild of the Aurelle APAC Intelligence Hub. The
React front-end replaces the original Streamlit UI for a fully bespoke, premium
design, while the **Python engine is reused unchanged** — analytics, governance,
LLM routing/failover and RAG all live in `utils/`, `governance_client.py` and
`data/`.

> The original Streamlit version lives in a separate repository
> (`aurelle_ai_hub`). This repo is the React layer + the engine it runs on.

## Architecture

```
web/    React + Vite + TypeScript + Tailwind — the design layer
api/    FastAPI — wraps the Python engine as JSON + streaming endpoints
utils/  Engine: LLM client (failover), security, audit, auth, guardrails,
        prompts, RAG vector store
governance_client.py   The single governed-access seam (RBAC · residency · PII · audit)
data/   Synthetic demo datasets (CRM, sales, supply, marketing, boutiques)
```

The browser never touches data files or API keys — every record access, PII
redaction, residency check, audit event and LLM call happens server-side.

## Modules

Executive Dashboard · Clienteling & CRM (governed Co-Pilot + Maison Strategy RAG)
· Product Performance · Boutique Analytics · Demand & Supply Planning ·
Marketing Intelligence · LLMOps & Prompt Lab (monitoring · prompt playground ·
editable module system prompts).

## Run locally

### 1. Backend (Python)

```bash
python -m venv venv && source venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
pip install -r api/requirements.txt

cp .env.example .env        # then add your OPENAI_API_KEY (and optional XAI_API_KEY)
uvicorn api.main:app --reload --port 8000
```

Health check: http://localhost:8000/api/health

### 2. Frontend (Node 18+)

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. Sign in with `admin@aurelle.com` and the demo
password configured in your `.env` (`ADMIN_PASSWORD_HASH`, or the built-in demo
fallback when no hash is set).

> Corporate TLS note: if `npm install` or the Python API hits certificate
> errors, prefix with the OS trust store — `NODE_OPTIONS="--use-system-ca"` for
> npm; the API already injects `truststore` automatically.

## Notes

- Default `PRIMARY_MODEL` is `o3`; set `PRIMARY_MODEL=gpt-4o-mini` in `.env` for
  faster first-token latency while testing.
- The governed lookup uses the Atelier governance core when installed, otherwise
  a local fallback that synthesizes the governance envelope so the app runs
  end-to-end without it.

## Deploy — Hugging Face Spaces (Docker)

This repo ships a `Dockerfile` that builds the React front-end and runs the
FastAPI API serving **both** the UI and `/api` on one origin (port `7860`).

1. Create a new **Space → Docker → Blank** on Hugging Face.
2. Add it as a git remote and push:
   ```bash
   git remote add space https://huggingface.co/spaces/<user>/<space-name>
   git push space main
   ```
3. In the Space **Settings → Secrets**, add your keys (same names as `.env`):
   `OPENAI_API_KEY` (or `OPENROUTER_API_KEY` / `XAI_API_KEY`), `ADMIN_PASSWORD_HASH`,
   and optionally `PRIMARY_MODEL` (e.g. `gpt-4o-mini`).

The Space builds the image and serves the app at its URL. The front-end calls
the API on the same origin, so no `VITE_API_URL` is needed.

See `REBUILD_POC.md` for the migration background.
