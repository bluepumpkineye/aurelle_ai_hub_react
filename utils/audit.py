"""
Audit / security event logging — supports ISO/IEC 27001:2022 Annex A controls
A.8.15 (Logging) and A.8.16 (Monitoring activities).

Design principles
-----------------
- **Structured**: one JSON object per line (machine-parseable for a SIEM).
- **Who / what / when / outcome**: every event carries a UTC timestamp, the
  acting user, a session id, the action, and its result.
- **No sensitive payloads**: prompts, model responses, passwords and secrets are
  never written — only metadata (action, provider, outcome, reason). This keeps
  the audit trail itself from becoming a data-leak vector (A.8.12 / A.5.34).
- **Best-effort**: logging must never break the application flow.

Logs are written to a rotating file (``logs/audit.log``, gitignored) and to the
process logger. In production, ship these to a centralized, access-controlled,
tamper-evident store (control A.8.15 requires log protection + retention).
"""

import os
import json
import uuid
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone

_LOG_DIR  = os.getenv("AUDIT_LOG_DIR", "logs")
_LOG_FILE = os.path.join(_LOG_DIR, "audit.log")

_audit_logger = logging.getLogger("aurelle.audit")
_audit_logger.setLevel(logging.INFO)
_audit_logger.propagate = False

_configured = False


def _configure() -> None:
    """Attach a rotating file handler once (idempotent, best-effort)."""
    global _configured
    if _configured:
        return
    try:
        os.makedirs(_LOG_DIR, exist_ok=True)
        handler = RotatingFileHandler(
            _LOG_FILE, maxBytes=2_000_000, backupCount=5, encoding="utf-8"
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        _audit_logger.addHandler(handler)
    except Exception:
        # Fall back to the root/stream logger if the file can't be opened
        # (e.g. read-only container filesystem on Hugging Face Spaces).
        pass
    _configured = True


def _session_id() -> str:
    """Stable per-session id (generated lazily, stored in session state)."""
    try:
        import streamlit as st
        sid = st.session_state.get("_audit_sid")
        if not sid:
            sid = uuid.uuid4().hex[:12]
            st.session_state["_audit_sid"] = sid
        return sid
    except Exception:
        return "no-session"


def _current_user() -> str:
    try:
        import streamlit as st
        return st.session_state.get("user_email", "anonymous")
    except Exception:
        return "system"


def record(event_type: str, outcome: str = "success", user: str = None, **details) -> None:
    """
    Write one audit event. ``details`` must contain only non-sensitive metadata.
    """
    _configure()
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event_type,
        "outcome": outcome,
        "user": user if user is not None else _current_user(),
        "session": _session_id(),
    }
    if details:
        entry.update({k: v for k, v in details.items() if v is not None})
    try:
        _audit_logger.info(json.dumps(entry, ensure_ascii=False, default=str))
    except Exception:
        pass


# ── Convenience wrappers for the common event classes ──────────
def log_auth(action: str, outcome: str, user: str = None, **details) -> None:
    """Authentication / session events (login, logout, lockout, timeout)."""
    record(f"auth.{action}", outcome=outcome, user=user, **details)


def log_llm(provider: str, model: str, outcome: str = "success", **details) -> None:
    """LLM usage events — metadata only, never prompt/response content."""
    record("llm.generate", outcome=outcome, provider=provider, model=model, **details)


def log_security(action: str, reason: str = "", **details) -> None:
    """Security control events (guardrail block, rate-limit, injection attempt)."""
    record(f"security.{action}", outcome="blocked", reason=reason, **details)
