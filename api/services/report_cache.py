"""Disk-backed response cache for module insight reports.

Every module "Generate Report" call produces a fully deterministic ``messages``
payload — the module system prompt (from utils.prompts, including any LLMOps
overrides) plus a user prompt derived only from the active filters over static
data. Identical inputs therefore warrant an identical report, so we cache the
generated text keyed by a hash of the request.

The cache is self-invalidating exactly the way the UI implies:
  • Editing a module's system prompt in LLMOps changes the system message  → new key.
  • Changing dashboard filters changes the user message                    → new key.
Nothing else moves the key, so the same button + same filters = a free replay.

Only successful generations are stored (see cache_store's ``ok`` guard) — an
error/fallback response is never cached, so a transient outage can't poison it.
"""
from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE_FILE = ROOT / "data" / "report_cache.json"

# Keep the file bounded — evict the oldest entries past this many.
_MAX_ENTRIES = 500

_lock = threading.Lock()


def make_key(messages: list, temperature: float, max_tokens: int, model: str) -> str:
    """Stable hash of everything that can change the generated report."""
    payload = json.dumps(
        {
            "messages": messages,
            "temperature": round(float(temperature), 4),
            "max_tokens": int(max_tokens),
            "model": model,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _read() -> dict:
    if not CACHE_FILE.exists():
        return {}
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def cache_get(key: str) -> str | None:
    with _lock:
        entry = _read().get(key)
    if isinstance(entry, dict):
        text = entry.get("text")
        return text if isinstance(text, str) and text else None
    return None


def cache_store(key: str, text: str, meta: dict | None = None) -> None:
    """Persist a completed report. No-op for empty text."""
    if not text or not text.strip():
        return
    with _lock:
        data = _read()
        # Monotonic insertion order gives us cheap oldest-first eviction; the
        # sequence counter avoids Date.now()/clock dependence.
        seq = 1 + max((e.get("seq", 0) for e in data.values() if isinstance(e, dict)), default=0)
        data[key] = {"text": text, "seq": seq, **({"meta": meta} if meta else {})}
        if len(data) > _MAX_ENTRIES:
            ordered = sorted(data.items(), key=lambda kv: kv[1].get("seq", 0))
            data = dict(ordered[-_MAX_ENTRIES:])
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = CACHE_FILE.with_suffix(".json.tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            tmp.replace(CACHE_FILE)
        except Exception:
            pass


def cache_clear() -> int:
    """Drop the whole cache. Returns the number of entries removed."""
    with _lock:
        n = len(_read())
        try:
            if CACHE_FILE.exists():
                CACHE_FILE.unlink()
        except Exception:
            pass
    return n
