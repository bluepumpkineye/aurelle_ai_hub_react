"""Headless LLMOps service — model monitoring metrics + prompt-lab support."""
from __future__ import annotations

import random

MODELS = {
    "gpt-4o (CRM Assistant)": {"latency": 1.24, "uptime": 99.8, "cost_day": 42.50, "queries": 284, "version": "v2.1"},
    "gpt-4o (Sales Insights)": {"latency": 1.41, "uptime": 99.6, "cost_day": 31.20, "queries": 198, "version": "v1.8"},
    "text-embedding-3-small (RAG)": {"latency": 0.18, "uptime": 99.9, "cost_day": 8.40, "queries": 892, "version": "v1.0"},
    "Forecast ML (sklearn)": {"latency": 0.04, "uptime": 100, "cost_day": 0, "queries": 56, "version": "v3.2"},
}

# Day labels are passed in by the caller (Date.now() is fine in the browser);
# the backend keeps everything deterministic so renders are stable.
_DAY_LABELS = [f"D-{i}" for i in range(14, 0, -1)]


def monitor() -> dict:
    rnd = random.Random(42)
    volume = [{"name": _DAY_LABELS[i], "value": rnd.randint(120, 520)} for i in range(14)]
    guardrails = [
        {"name": n, "value": rnd.randint(0, 8)}
        for n in ["Input Blocked", "Output Flagged", "PII Detected", "Off-Brand Tone"]
    ]
    latency = [{"name": m.split("(")[0].strip(), "value": round(v["latency"] * 1000, 1)} for m, v in MODELS.items()]
    cost = [{"name": m.split("(")[0].strip(), "value": v["cost_day"]} for m, v in MODELS.items() if v["cost_day"] > 0]

    modules = ["CRM RAG", "Sales Insights", "Marketing", "Supply Chain", "CRM RAG", "Sales Insights", "CRM RAG", "Marketing"]
    passes = [True, True, True, True, False, True, True, True]
    evals = []
    for i in range(8):
        tin = rnd.randint(800, 2400)
        tout = rnd.randint(200, 800)
        evals.append({
            "ago_h": i * 3,
            "module": modules[i],
            "tokens_in": tin,
            "tokens_out": tout,
            "latency": round(rnd.uniform(0.8, 2.4), 2),
            "pass": passes[i],
            "quality": round(rnd.uniform(7.5, 9.8), 1),
            "cost": round(tin * 0.000005 + tout * 0.000015, 4),
        })

    return {
        "models": [{"name": k, **v, "healthy": v["uptime"] > 99.5} for k, v in MODELS.items()],
        "charts": {"volume": volume, "guardrails": guardrails, "latency": latency, "cost": cost},
        "evals": evals,
        "architecture": [
            "Streamlit / React Frontend",
            "LangChain Orchestration",
            "Guardrails — input check · PII filter · brand-safe",
            "OpenAI / xAI Completions  ·  Embeddings API",
            "LightRAG Graph DB (entities & relationships)",
            "LLMOps Monitor — latency · cost · eval scores",
        ],
    }


# Prompt Laboratory templates (mirrors prompt_lab.py PROMPT_TEMPLATES).
PROMPT_TEMPLATES = {
    "Client Re-engagement": "You are an Aurelle Personal Stylist. Write an elegant, personalised re-engagement message for a client who hasn't visited in 180 days. Reference their preferred category: High Jewellery. Market: China. Tone: warm, exclusive, not pushy. Max 120 words.",
    "Product Recommendation": "You are an Aurelle product advisor. Recommend 2-3 pieces from our High Jewellery collection for a client celebrating an anniversary, budget $50K+. Market: Japan. Be specific with product names and craft a compelling narrative.",
    "VIP Event Invitation": "Draft an exclusive VIP event invitation for a Maison VIP client in Hong Kong for our upcoming Private High Jewellery Salon. Convey rarity, prestige, and personal connection. Keep under 150 words.",
    "Sales Performance Commentary": "You are an Aurelle regional analyst. Write a concise, executive commentary on APAC sales performance, highlighting the top market, the strongest category, and one clear action for the week.",
}


def templates() -> dict:
    # also surface the live module system prompts (read-only)
    try:
        from utils.prompts import DEFAULT_PROMPTS
        module_prompts = {k: str(v) for k, v in DEFAULT_PROMPTS.items()}
    except Exception:
        module_prompts = {}
    return {"templates": PROMPT_TEMPLATES, "module_prompts": module_prompts}
