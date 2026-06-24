"""
Centralized application-security controls for the Aurelle hub.

Defense-in-depth primitives that run inside the Streamlit session:
  • Abuse control   — per-session rate limiting + input length caps
  • LLM safety      — prompt-injection / jailbreak detection
  • Session safety  — idle timeout + brute-force login lockout
  • Info hygiene    — sanitized, user-safe error messages (details to logs only)

All limits are env-tunable (see .env.example). Everything degrades gracefully
when called outside a Streamlit runtime so the module stays unit-testable.
"""

import os
import re
import time
import logging

logger = logging.getLogger("aurelle.security")

# ── Tunables (env-overridable) ─────────────────────────────────
RATE_LIMIT_PER_MIN = int(os.getenv("LLM_RATE_LIMIT_PER_MIN", "15"))
MAX_INPUT_CHARS    = int(os.getenv("MAX_INPUT_CHARS", "4000"))
SESSION_TIMEOUT_S  = int(os.getenv("SESSION_IDLE_TIMEOUT_MIN", "60")) * 60
LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCKOUT_S    = int(os.getenv("LOGIN_LOCKOUT_MIN", "15")) * 60


def _state():
    """Return st.session_state, or None when not inside a Streamlit run."""
    try:
        import streamlit as st
        return st.session_state
    except Exception:
        return None


# ── Rate limiting (sliding window, per session) ────────────────
def check_rate_limit(bucket: str = "llm", limit: int = None, window_s: int = 60) -> tuple:
    """
    Sliding-window limiter. Returns (allowed: bool, retry_after_s: int).
    State is per Streamlit session — appropriate for a single-tenant demo; a
    real multi-tenant SaaS should enforce this at an edge gateway / Redis too.
    """
    limit = limit or RATE_LIMIT_PER_MIN
    state = _state()
    if state is None:
        return True, 0

    now = time.time()
    key = f"_rl_{bucket}"
    hits = [t for t in state.get(key, []) if now - t < window_s]
    if len(hits) >= limit:
        retry = int(window_s - (now - hits[0])) + 1
        logger.warning("Rate limit hit on bucket '%s' (%d/%ds)", bucket, limit, window_s)
        state[key] = hits
        return False, max(retry, 1)
    hits.append(now)
    state[key] = hits
    return True, 0


# ── Input validation ───────────────────────────────────────────
def enforce_input_limits(text: str, max_chars: int = None) -> tuple:
    """Returns (ok: bool, message_or_text). Caps length and rejects empty input."""
    max_chars = max_chars or MAX_INPUT_CHARS
    if text is None or not str(text).strip():
        return False, "Input is empty."
    if len(text) > max_chars:
        return False, f"Input too long ({len(text):,} chars). Limit is {max_chars:,}."
    return True, text


# ── Prompt-injection / jailbreak detection ─────────────────────
_INJECTION_PATTERNS = [
    r"ignore (all|any|the|your|previous|prior|above)\b.*\b(instruction|prompt|rule)",
    r"disregard (all|any|the|your|previous|prior|above)\b",
    r"forget (everything|all|your|previous|prior)\b",
    r"\b(system|developer)\s*(prompt|message|instruction)\b",
    r"reveal|print|show|repeat|exfiltrate\b.*\b(system|prompt|instruction|api[_\s-]?key|secret|password)",
    r"you are now\b|act as\b.*\b(dan|jailbreak|unrestricted|no rules)",
    r"\b(jailbreak|do anything now|developer mode)\b",
    r"<\|?(im_start|system|endoftext)\|?>",   # control-token injection
    r"override (your|the|all|safety|content)\b",
]
_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def detect_prompt_injection(text: str) -> tuple:
    """Returns (is_suspicious: bool, reason: str)."""
    if not text:
        return False, ""
    for rx in _INJECTION_RE:
        if rx.search(text):
            logger.warning("Prompt-injection pattern matched: %s", rx.pattern)
            return True, "Request blocked: it resembles a prompt-injection attempt."
    return False, ""


def vet_user_prompt(text: str) -> tuple:
    """
    One-shot gate for user-supplied LLM input: length + injection.
    Returns (ok: bool, message_or_text).
    """
    ok, payload = enforce_input_limits(text)
    if not ok:
        return False, payload
    bad, reason = detect_prompt_injection(text)
    if bad:
        try:
            from utils import audit
            audit.log_security("prompt_injection", reason="pattern_match")
        except Exception:
            pass
        return False, reason
    return True, text


# ── Session safety ─────────────────────────────────────────────
def touch_session() -> None:
    """Record activity timestamp for idle-timeout tracking."""
    state = _state()
    if state is not None:
        state["_last_active"] = time.time()


def session_expired() -> bool:
    """True if the session has been idle past SESSION_TIMEOUT_S."""
    state = _state()
    if state is None or SESSION_TIMEOUT_S <= 0:
        return False
    last = state.get("_last_active")
    if last is None:
        return False
    return (time.time() - last) > SESSION_TIMEOUT_S


def record_login_attempt(success: bool) -> None:
    state = _state()
    if state is None:
        return
    if success:
        state["_login_fails"] = 0
        state.pop("_login_locked_until", None)
    else:
        state["_login_fails"] = state.get("_login_fails", 0) + 1
        if state["_login_fails"] >= LOGIN_MAX_ATTEMPTS:
            state["_login_locked_until"] = time.time() + LOGIN_LOCKOUT_S
            logger.warning("Login lockout engaged after %d failures", state["_login_fails"])


def login_locked() -> tuple:
    """Returns (locked: bool, retry_after_s: int)."""
    state = _state()
    if state is None:
        return False, 0
    until = state.get("_login_locked_until")
    if until and time.time() < until:
        return True, int(until - time.time())
    return False, 0


# ── Error hygiene ──────────────────────────────────────────────
def safe_error(exc: Exception, public_msg: str = "Something went wrong. Please try again.") -> str:
    """Log the full exception server-side; return a generic message to the UI."""
    logger.error("Handled exception: %s", exc, exc_info=True)
    return public_msg
