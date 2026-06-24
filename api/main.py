"""Aurelle API — headless backend for the new React front-end.

Wraps the existing Python engine (analytics, governance, LLM) as JSON/stream
endpoints. The engine, modules and data are imported unchanged.

Run from the project root:
    uvicorn api.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
