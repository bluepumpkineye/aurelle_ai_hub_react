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
from starlette.types import Scope

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
class SPAStaticFiles(StaticFiles):
    """StaticFiles with SPA-correct caching.

    Vite emits content-hashed files under /assets/ — their names change on every
    build, so they can be cached forever (immutable). Everything else (notably
    the index.html entry document) is served ``no-cache`` so the browser and any
    CDN edge always revalidate and a redeploy shows up immediately, without a
    hard refresh.
    """

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        normalized = path.replace("\\", "/")
        if normalized.startswith("assets/") or "/assets/" in normalized:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


_DIST = os.path.join(os.path.dirname(__file__), "..", "web", "dist")
if os.path.isdir(_DIST):
    app.mount("/", SPAStaticFiles(directory=_DIST, html=True), name="spa")
