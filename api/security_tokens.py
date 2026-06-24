"""Lightweight HMAC-signed bearer tokens for the API POC.

Dependency-free (stdlib only). For the production SaaS path this is where you
swap in the Supabase JWT verification — the rest of the API is unaffected.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException

_SECRET = os.getenv("AURELLE_API_SECRET", "aurelle-local-dev-secret").encode("utf-8")
_TTL_SECONDS = int(os.getenv("AURELLE_TOKEN_TTL_MIN", "720")) * 60


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str) -> str:
    return _b64e(hmac.new(_SECRET, body.encode("ascii"), hashlib.sha256).digest())


def make_token(email: str) -> str:
    payload = {"email": email, "exp": int(time.time()) + _TTL_SECONDS}
    body = _b64e(json.dumps(payload).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def verify_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        payload = json.loads(_b64d(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def require_auth(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency — rejects requests without a valid bearer token."""
    token = authorization.replace("Bearer ", "").strip()
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return payload
