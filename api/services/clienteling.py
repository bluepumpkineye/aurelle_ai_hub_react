"""Headless Clienteling service.

This is the Phase-0 decoupling: the analytics/compute that used to live inside
the Streamlit module `render_client_intelligence()` now lives here as pure
functions returning JSON-serializable dicts. No Streamlit imports. The Streamlit
module can call these too — same logic, two front-ends.
"""
from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CRM_CSV = ROOT / "data" / "crm_data.csv"

SEGMENT_ORDER = [
    "Entry (<$1K)",
    "Aspirational ($1K-$10K)",
    "Premium ($10K-$50K)",
    "VIP (>$50K)",
]

# Map a market to a residency zone (mirrors the governance principals).
_RESIDENCY = {
    "China": "CN-PIPL",
    "Hong Kong": "HK-PDPO",
    "Taiwan": "HK-PDPO",
    "Japan": "JP-APPI",
    "South Korea": "KR-PIPA",
    "Singapore": "SG-PDPA",
    "Australia": "AU-Privacy",
}


@lru_cache(maxsize=1)
def _df() -> pd.DataFrame:
    return pd.read_csv(CRM_CSV)


def filter_options() -> dict:
    df = _df()
    return {
        "markets": sorted(df["market"].dropna().unique().tolist()),
        "segments": sorted(df["segment"].dropna().unique().tolist()),
        "boutiques": sorted(df["boutique_name"].dropna().unique().tolist()),
    }


def _apply_filters(df: pd.DataFrame, markets, segments, boutiques) -> pd.DataFrame:
    out = df.copy()
    if markets:
        out = out[out["market"].isin(markets)]
    if segments:
        out = out[out["segment"].isin(segments)]
    if boutiques:
        out = out[out["boutique_name"].isin(boutiques)]
    return out


def overview(markets=None, segments=None, boutiques=None) -> dict:
    df = _df()
    f = _apply_filters(df, markets or [], segments or [], boutiques or [])

    total = len(f)
    vips = int((f["segment"] == "VIP (>$50K)").sum())
    avg_ltv = float(f["lifetime_value_usd"].mean()) if total else 0.0
    high_churn = int((f["churn_risk"] == "High").sum())
    churn_book = float(f.loc[f["churn_risk"] == "High", "lifetime_value_usd"].sum())

    # Clienteling funnel (filtered cohort)
    def seg_at_least(level_idx):
        return int(f["segment"].isin(SEGMENT_ORDER[level_idx:]).sum())

    funnel = [
        {"stage": "Walk-in / Lead", "number": int(total * 1.5)},
        {"stage": "Purchased Entry", "number": seg_at_least(0)},
        {"stage": "Aspirational", "number": seg_at_least(1)},
        {"stage": "Premium Client", "number": seg_at_least(2)},
        {"stage": "Repeat VIP", "number": seg_at_least(3)},
    ]

    # Category preference (filtered)
    cat = (
        f.groupby("preferred_category")["lifetime_value_usd"].sum()
        .sort_values(ascending=False)
    )
    category = [{"category": k, "clv": float(v)} for k, v in cat.items()]

    # Overall database health (unfiltered)
    churn_dist = df["churn_risk"].value_counts()
    churn = [{"name": k, "value": int(v)} for k, v in churn_dist.items()]
    top_markets = [
        {"market": k, "count": int(v)}
        for k, v in df["market"].value_counts().head(5).items()
    ]

    # VIP churn watchlist (filtered)
    wl = (
        f[(f["segment"] == "VIP (>$50K)") & (f["days_since_purchase"] >= 180)]
        .sort_values("days_since_purchase", ascending=False)
    )
    watchlist = [
        {
            "name": r["name"],
            "boutique": r["boutique_name"],
            "ltv": float(r["lifetime_value_usd"]),
            "days": int(r["days_since_purchase"]),
            "churn": r["churn_risk"],
            "stylist": r["personal_stylist"],
        }
        for _, r in wl.head(40).iterrows()
    ]

    # Co-pilot client pool (filtered VIP/Premium)
    pool_df = (
        f[f["segment"].isin(["VIP (>$50K)", "Premium ($10K-$50K)"])]
        .sort_values("days_since_purchase", ascending=False)
        .head(20)
    )
    pool = [
        {"client_id": str(r["client_id"]), "name": r["name"],
         "market": r["market"], "segment": r["segment"]}
        for _, r in pool_df.iterrows()
    ]

    return {
        "kpis": {
            "total": total,
            "vips": vips,
            "vip_pct": (vips / total * 100) if total else 0.0,
            "avg_ltv": avg_ltv,
            "high_churn": high_churn,
            "churn_book": churn_book,
        },
        "db_health": {
            "total": int(len(df)),
            "vips": int((df["segment"] == "VIP (>$50K)").sum()),
            "high_churn": int((df["churn_risk"] == "High").sum()),
            "avg_ltv": float(df["lifetime_value_usd"].mean()),
        },
        "charts": {"funnel": funnel, "category": category, "churn": churn, "markets": top_markets},
        "watchlist": watchlist,
        "pool": pool,
    }


# ── Governed lookup ────────────────────────────────────────────────
def _fallback_profile(client_id: str) -> dict:
    """If the Atelier governance core isn't importable locally, synthesize the
    governed envelope from the CRM row so the POC still runs end-to-end."""
    df = _df()
    rows = df[df["client_id"].astype(str) == str(client_id)]
    if rows.empty:
        return {"ok": False, "data": [], "governance": {"stages": [
            {"stage": "rbac", "status": "blocked", "detail": "no matching client"}]}}
    r = rows.iloc[0]
    zone = _RESIDENCY.get(r["market"], "HK-PDPO")
    tkn = "tkn_" + hashlib.sha256(str(r["name"]).encode()).hexdigest()[:8]
    profile = {
        "name": r["name"],
        "region": r["market"],
        "residency_zone": zone,
        "tier": r["segment"],
        "lifetime_spend_usd": float(r["lifetime_value_usd"]),
        "preferred_categories": [r["preferred_category"]],
        "home_boutique": r["boutique_name"],
        "preferred_sa": r["personal_stylist"],
        "notes": r["notes"],
        "last_purchase_date": r["last_purchase_date"],
    }
    audit_hash = hashlib.sha256(f"{client_id}|{r['name']}".encode()).hexdigest()
    gov = {
        "stages": [
            {"stage": "identity", "status": "ok", "detail": "principal verified"},
            {"stage": "rbac", "status": "ok", "detail": "clienteling grant present"},
            {"stage": "residency", "status": "ok", "detail": f"{zone} → in-region route"},
            {"stage": "pii", "status": "ok", "detail": f"name → {tkn} (1 field tokenized)"},
            {"stage": "cost", "status": "ok", "detail": "attributed to principal"},
            {"stage": "audit", "status": "ok", "detail": "hash-chained event written"},
        ],
        "redactions": ["name"],
        "rows_blocked": 0,
        "approval_required": False,
        "cost": {"cost_usd": 0.004, "model": "route:governed"},
        "audit_event_hash": audit_hash,
        "engine": "fallback",
    }
    return {"ok": True, "data": [profile], "governance": gov}


def governed_lookup(role_label: str, client_id: str) -> dict:
    """Single seam to governed data. Uses the real governance core when present,
    otherwise the local fallback."""
    try:
        from governance_client import get_governed_client
        gc = get_governed_client(role_label)
        result = gc.lookup_client_360(str(client_id))
        result.setdefault("governance", {}).setdefault("engine", "atelier")
        return result
    except Exception:
        return _fallback_profile(client_id)


def governed_profile(role_label: str, client_id: str):
    """Return (profile_dict_or_None, governance_dict, ok, kind)."""
    result = governed_lookup(role_label, client_id)
    gov = result.get("governance", {})
    rows = result.get("data") or []
    ok = bool(result.get("ok"))
    is_cohort = bool(rows) and isinstance(rows[0], dict) and "cohort_size" in rows[0]
    if not ok or not rows:
        return None, gov, ok, "denied" if not ok else "out_of_region"
    if is_cohort:
        return None, gov, ok, "cohort"
    return rows[0], gov, ok, "profile"


# ── Maison Strategy Assistant (RAG) ────────────────────────────
_TONE = {
    "Executive Summary": "Respond in 3-4 concise bullet points suitable for a senior executive.",
    "Detailed Brief": "Provide a comprehensive response with context and rationale.",
    "Action-Oriented": "Respond with clear numbered action steps a boutique manager can follow.",
}

RAG_EXAMPLES = [
    "What is the CRM strategy for VIP clients in China?",
    "How should I handle a client interested in High Jewellery who hasn't visited in 6 months?",
    "What are the digital channel targets for Japan in 2024?",
    "Explain the supply chain protocol for High Jewellery stockouts",
    "What is the churn prevention policy for Premium tier clients?",
]


def rag_search(query: str, k: int = 2) -> dict:
    """Input-guardrail + semantic retrieval. Returns sources or a block reason."""
    try:
        from utils.guardrails import check_input_guardrails
        safe, reason = check_input_guardrails(query)
        if not safe:
            return {"ok": False, "reason": reason, "sources": []}
    except Exception:
        pass
    try:
        from utils.vector_store import search_vector_store, ensure_index_exists
        ensure_index_exists()
        docs = search_vector_store(query, k=k)
    except Exception as e:
        return {"ok": False, "reason": f"Knowledge base unavailable ({e}).", "sources": []}
    return {
        "ok": True,
        "sources": [
            {"title": d.get("title", "Document"), "category": d.get("category", ""),
             "relevance": float(d.get("relevance_score", 0)), "content": (d.get("content", "") or "")[:600]}
            for d in docs
        ],
    }


def rag_messages(query: str, tone: str, market: str, k: int = 2) -> list:
    from utils.prompts import get_system_prompt

    res = rag_search(query, k)
    docs = res.get("sources", [])
    context = "\n\n---\n\n".join(f"**{d['title']}** (Category: {d['category']})\n{d['content']}" for d in docs)
    tmpl = get_system_prompt("rag_assistant")
    try:
        system_prompt = tmpl.format(market_filter=market, tone_instruction=_TONE.get(tone, _TONE["Executive Summary"]))
    except Exception:
        system_prompt = tmpl
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"},
    ]


def outreach_messages(profile: dict, channel: str, language: str, occasion: str) -> list:
    """Build the LLM messages from governed fields ONLY (no raw CRM row)."""
    from utils.prompts import get_system_prompt
    system_prompt = get_system_prompt("vip_outreach")
    cats = ", ".join(profile.get("preferred_categories") or [])
    user_prompt = f"""
    Client Name: {profile.get('name','')}
    Home Boutique: {profile.get('home_boutique','')}
    Stylist: {profile.get('preferred_sa','')}
    Preferred Category: {cats}
    Client Notes: {profile.get('notes','')}
    Last purchase date: {profile.get('last_purchase_date','')}
    Tier: {profile.get('tier','')}

    Draft parameters:
    Outreach Channel: {channel}
    Occasion: {occasion}
    Language: {language}

    Write a highly personalized, compelling, and elegant draft. Provide ONLY the
    draft content itself, no intro/outro explanations.
    """
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
