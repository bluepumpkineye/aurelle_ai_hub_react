# Aurelle UI Rebuild — Clienteling Proof of Concept

A new **React frontend** (`web/`) + **FastAPI backend** (`api/`) that replaces the
Streamlit UI for the Clienteling module **without changing the engine** — the
analytics, governance core, LLM routing and data are imported unchanged from the
existing project.

```
api/    FastAPI — wraps the Python engine as JSON + streaming endpoints
web/    React + Vite + TypeScript + Tailwind — the new design layer
```

Nothing here is committed — it's for local evaluation.

## 1. Backend (Python)

From the project root (`cartier-ai-hub/`):

```bash
# one-time: install the two API deps alongside your existing venv
pip install -r api/requirements.txt

# run it (reads your existing .env for OPENAI_API_KEY etc.)
uvicorn api.main:app --reload --port 8000
```

Check it: open http://localhost:8000/api/health → `{"ok": true}`.

> The governed lookup uses the real Atelier core if it's importable; otherwise it
> falls back to a synthesized governance envelope so the POC runs end-to-end
> locally. Either way the trace (RBAC · residency · PII · cost · audit) renders.

## 2. Frontend (Node)

In a second terminal:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173.

> If `npm install` fails with a TLS/cert error on a corporate network, run it as:
> `NODE_OPTIONS="--use-system-ca" npm install` (Git Bash) or
> `$env:NODE_OPTIONS="--use-system-ca"; npm install` (PowerShell).

## 3. Sign in

Use your existing Aurelle credentials — `admin@aurelle.com` and the demo password
from your `.env` (`ADMIN_PASSWORD_HASH`, or the built-in `AurelleAPAC2026!` if no
hash is set).

## What to look at

- **Filters → KPIs/charts** update live (Markets / Segments / Boutique).
- **VIP Churn Watchlist** — dormant >180-day VIPs.
- **AI Co-Pilot** — pick a *role* and a *client*; the governed profile + the
  **governance trace** render, then **Generate** streams the outreach draft
  token-by-token (assembled only from governed fields).
- Switch the **role** to a non-clienteling one to watch the same query get
  blocked / down-scoped by governance.

## How this maps to the full migration

- `api/services/clienteling.py` is the **Phase-0 decoupling** — pure compute,
  no Streamlit. The other 7 modules follow this exact pattern.
- `api/llm_stream.py` reuses `utils/llm_client.py` unchanged.
- The React side is one page (`web/src/pages/Clienteling.tsx`); the rest of the
  modules become sibling pages against the same API patterns.
