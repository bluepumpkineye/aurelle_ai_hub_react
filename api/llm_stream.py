"""Token-streaming wrapper around the existing LLM engine.

Reuses utils.llm_client's provider registry, key handling and kwargs builder —
the engine file is NOT modified. Adds primary→fallback failover with real
token streaming for the UI's "generating…" experience.
"""
from __future__ import annotations

import logging
from typing import Iterator

from utils.llm_client import (
    FALLBACK_MODEL,
    PRIMARY_MODEL,
    _build_kwargs,
    _get_client,
    _provider_for_model,
    get_api_key,
)

logger = logging.getLogger("aurelle.api.stream")


def _attempt_stream(provider: str, model: str, messages: list,
                    temperature: float, max_tokens: int) -> Iterator[str]:
    api_key = get_api_key(provider)
    if not api_key:
        raise RuntimeError(f"{provider} API key not configured")

    # An OpenRouter key (sk-or-…) in the OpenAI slot routes via OpenRouter.
    if provider == "openai" and api_key.startswith("sk-or-"):
        provider = "openrouter"
        if not model.startswith("openai/"):
            model = f"openai/{model}"

    client = _get_client(provider, api_key)
    kwargs = _build_kwargs(provider, model, messages, temperature, max_tokens)
    kwargs["stream"] = True

    produced = False
    for chunk in client.chat.completions.create(**kwargs):
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            produced = True
            yield delta
    if not produced:
        raise RuntimeError("Empty stream from model")


def stream_chat(messages: list, model: str | None = None,
                temperature: float = 0.45, max_tokens: int = 1024) -> Iterator[str]:
    """Yield response tokens, failing over to the fallback model if the primary
    errors before producing any output."""
    primary = (model or PRIMARY_MODEL).strip()
    chain: list[tuple[str, str]] = []
    for mdl in (primary, FALLBACK_MODEL):
        entry = (_provider_for_model(mdl), mdl)
        if entry not in chain:
            chain.append(entry)

    errors = []
    for provider, mdl in chain:
        try:
            yield from _attempt_stream(provider, mdl, messages, temperature, max_tokens)
            return
        except Exception as e:  # noqa: BLE001
            errors.append(f"{provider}:{mdl} — {e}")
            logger.warning("stream attempt failed: %s", e)
            continue

    yield "\n\n⚠️ AI engine temporarily unavailable. " + " | ".join(errors)
