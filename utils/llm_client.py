"""
LLM client with automatic provider fail-over.

Design
------
Aurelle runs a **primary** model (OpenAI by default) and transparently fails
over to a **fallback** model (xAI Grok) whenever the primary errors, times out,
returns nothing, or has no API key configured. There is no user-facing model
picker — resilience is handled here so the product never dead-ends on a demo.

Configuration is environment-driven (see .env.example):
    PRIMARY_MODEL    default "gpt-4o-mini"
    FALLBACK_MODEL   default "grok-4.3"
    LLM_TIMEOUT      per-request timeout in seconds (default 30)
    LLM_MAX_RETRIES  transient-error retries per provider (default 2)
"""

import os
import time
import logging
from functools import lru_cache

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("aurelle.llm")

# ── TLS trust ──────────────────────────────────────────────────
# Many corporate networks / antivirus suites (Zscaler, Kaspersky, ESET, …)
# intercept HTTPS and present their own root CA. That CA lives in the OS trust
# store but NOT in Python's bundled `certifi`, so outbound API calls fail with
# "CERTIFICATE_VERIFY_FAILED". `truststore` makes Python validate against the
# operating-system trust store, which fixes this while keeping verification ON.
# Set LLM_DISABLE_TRUSTSTORE=1 to opt out. Must run before any TLS connection.
if os.getenv("LLM_DISABLE_TRUSTSTORE", "").strip() not in ("1", "true", "True"):
    try:
        import truststore
        truststore.inject_into_ssl()
        logger.info("truststore: using OS certificate store for TLS verification")
    except Exception as e:  # noqa: BLE001 — never let trust setup break startup
        logger.warning("truststore unavailable (%s); falling back to certifi", e)

# ── Provider registry ──────────────────────────────────────────
PROVIDERS = {
    "openai":     {"label": "OpenAI",     "env": "OPENAI_API_KEY",     "base_url": None},
    "xai":        {"label": "xAI",        "env": "XAI_API_KEY",        "base_url": "https://api.x.ai/v1"},
    "openrouter": {"label": "OpenRouter", "env": "OPENROUTER_API_KEY", "base_url": "https://openrouter.ai/api/v1"},
}

# ── Routing configuration ──────────────────────────────────────
PRIMARY_MODEL   = os.getenv("PRIMARY_MODEL", "o3-2025-04-16").strip()
FALLBACK_MODEL  = os.getenv("FALLBACK_MODEL", "grok-4.3").strip()
REQUEST_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))
MAX_RETRIES     = int(os.getenv("LLM_MAX_RETRIES", "2"))
# Reasoning models (o-series) spend hidden tokens before emitting output, so a
# low cap yields empty responses. Floor the completion budget for them.
REASONING_MIN_TOKENS = int(os.getenv("REASONING_MIN_TOKENS", "2500"))

# Backwards-compatible exports (referenced across modules)
DEFAULT_MODEL = PRIMARY_MODEL
MODELS = {PRIMARY_MODEL: PRIMARY_MODEL, FALLBACK_MODEL: FALLBACK_MODEL}
FREE_MODELS = MODELS


def _provider_for_model(model: str) -> str:
    """Infer the API provider from a model name."""
    return "xai" if "grok" in model.lower() else "openai"


def get_api_key(provider: str) -> str:
    """Read a provider's API key from the environment (stripped of whitespace)."""
    cfg = PROVIDERS.get(provider)
    if not cfg:
        return ""
    val = os.getenv(cfg["env"], "")
    # An OpenRouter key may stand in for the OpenAI slot (auto-detected at call time).
    if provider == "openai" and not val:
        val = os.getenv("OPENROUTER_API_KEY", "")
    return val.strip()


def provider_status() -> dict:
    """Report which providers have keys — used by the sidebar status panel."""
    return {p: bool(get_api_key(p)) for p in PROVIDERS}


@lru_cache(maxsize=4)
def _get_client(provider: str, api_key: str) -> OpenAI:
    """Cache one OpenAI-compatible client per (provider, key) pair."""
    cfg = PROVIDERS[provider]
    return OpenAI(api_key=api_key, base_url=cfg["base_url"], timeout=REQUEST_TIMEOUT)


def _build_kwargs(provider: str, model: str, messages: list,
                  temperature: float, max_tokens: int) -> dict:
    kwargs = {"model": model, "messages": messages}

    # o-series reasoning models (o1/o3/o4): use max_completion_tokens, reject a
    # custom temperature, and need a higher token floor to leave room for
    # hidden reasoning before any visible output.
    is_reasoning = provider == "openai" and model.startswith(("o1", "o3", "o4"))
    use_completion_tokens = is_reasoning or (provider == "openai" and "gpt-5" in model)

    if use_completion_tokens:
        kwargs["max_completion_tokens"] = max(max_tokens, REASONING_MIN_TOKENS) if is_reasoning else max_tokens
    else:
        kwargs["max_tokens"] = max_tokens

    if not is_reasoning:
        kwargs["temperature"] = temperature

    return kwargs


def _call_once(provider: str, model: str, messages: list,
               temperature: float, max_tokens: int) -> str:
    """Single attempt against one provider. Raises on any failure."""
    api_key = get_api_key(provider)
    if not api_key:
        raise RuntimeError(f"{PROVIDERS[provider]['label']} API key not configured")

    # An OpenRouter key (sk-or-...) sitting in the OpenAI slot routes via OpenRouter.
    if provider == "openai" and api_key.startswith("sk-or-"):
        provider = "openrouter"
        if not model.startswith("openai/"):
            model = f"openai/{model}"

    client = _get_client(provider, api_key)
    kwargs = _build_kwargs(provider, model, messages, temperature, max_tokens)
    response = client.chat.completions.create(**kwargs)
    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise RuntimeError("Empty response from model")
    return content


def _call_with_retries(provider: str, model: str, messages: list,
                       temperature: float, max_tokens: int) -> str:
    """Attempt one provider with bounded exponential backoff on transient errors."""
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return _call_once(provider, model, messages, temperature, max_tokens)
        except Exception as e:  # noqa: BLE001 — provider SDKs raise heterogeneous errors
            last_err = e
            logger.warning("LLM attempt %d/%d on %s:%s failed: %s",
                           attempt, MAX_RETRIES, provider, model, e)
            if attempt < MAX_RETRIES:
                time.sleep(0.5 * attempt)  # 0.5s, 1.0s, ...
    raise last_err


def chat_completion(
    messages:    list,
    model:       str = None,
    temperature: float = 0.3,
    max_tokens:  int = 1024,
    return_meta: bool = False,
):
    """
    Generate a completion with automatic primary→fallback routing.

    The requested ``model`` (or PRIMARY_MODEL) is tried first; on any failure
    the FALLBACK_MODEL is tried next. Returns the response string, or — when
    ``return_meta`` is True — a dict with ``content``, ``provider``, ``model``
    and ``used_fallback`` for telemetry.
    """
    # ── Abuse control: per-session rate limit across every AI action ──
    try:
        from utils.security import check_rate_limit
        allowed, retry_after = check_rate_limit("llm")
        if not allowed:
            try:
                from utils import audit
                audit.log_security("rate_limit", reason=f"retry_after={retry_after}s")
            except Exception:
                pass
            msg = (f"⚠️ Rate limit reached. Please wait {retry_after}s before "
                   f"generating again.")
            if return_meta:
                return {"content": msg, "provider": None, "model": None,
                        "used_fallback": False, "rate_limited": True}
            return msg
    except Exception:  # never let the limiter break a generation
        pass

    primary_model = (model or PRIMARY_MODEL).strip()

    # Ordered, de-duplicated attempt chain: requested model first, then fallback.
    chain = []
    for mdl in (primary_model, FALLBACK_MODEL):
        entry = (_provider_for_model(mdl), mdl)
        if entry not in chain:
            chain.append(entry)

    errors = []
    for idx, (provider, mdl) in enumerate(chain):
        try:
            content = _call_with_retries(provider, mdl, messages, temperature, max_tokens)
            meta = {
                "content": content,
                "provider": provider,
                "model": mdl,
                "used_fallback": idx > 0,
            }
            _record_status(meta)
            try:
                from utils import audit
                audit.log_llm(provider, mdl, outcome="success", used_fallback=idx > 0)
            except Exception:
                pass
            return meta if return_meta else content
        except Exception as e:  # noqa: BLE001
            errors.append(f"{PROVIDERS[provider]['label']} ({mdl}): {e}")
            logger.error("Provider %s exhausted: %s", provider, e)

    failure = (
        "⚠️ AI engine temporarily unavailable. "
        "Both the primary and fallback models failed.\n\n"
        + "\n".join(f"• {e}" for e in errors)
    )
    _record_status({"content": failure, "provider": None, "model": None,
                    "used_fallback": True, "failed": True})
    try:
        from utils import audit
        audit.log_llm("none", primary_model, outcome="failure",
                      detail="; ".join(errors)[:300])
    except Exception:
        pass
    if return_meta:
        return {"content": failure, "provider": None, "model": None,
                "used_fallback": True, "failed": True}
    return failure


def _record_status(meta: dict) -> None:
    """Persist last-call routing info for the UI status panel (best-effort)."""
    try:
        import streamlit as st
        st.session_state["llm_last_provider"] = meta.get("provider")
        st.session_state["llm_last_model"] = meta.get("model")
        st.session_state["llm_used_fallback"] = meta.get("used_fallback", False)
    except Exception:
        pass


# ── Backwards-compatible helpers (kept for existing imports) ───
def get_available_free_models() -> dict:
    return MODELS


def get_default_model() -> str:
    return DEFAULT_MODEL
