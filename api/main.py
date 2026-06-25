"""Aurelle API — headless backend for the new React front-end.

Wraps the existing Python engine (analytics, governance, LLM) as JSON/stream
endpoints. The engine, modules and data are imported unchanged.

Run from the project root:
    uvicorn api.main:app --reload --port 8000
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers import auth, clienteling, analytics

app = FastAPI(title="Aurelle API", version="0.1.0")

# Local dev: the Vite front-end runs on :5173.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(clienteling.router)
app.include_router(analytics.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "aurelle-api"}


# ── Serve the built React app (production / container) ──────────────
# In local dev the front-end runs on Vite (:5173) and web/dist won't exist, so
# this mount is skipped. In the Docker image web/dist is present and the SPA is
# served from the same origin as the API. Mounted last so /api/* wins.
_DIST = os.path.join(os.path.dirname(__file__), "..", "web", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="spa")
