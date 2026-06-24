"""Headless Boutique Analytics service (decoupled from boutique_analytics.py)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


@lru_cache(maxsize=1)
def _load():
    with open(DATA / "boutiques_hierarchy.json", encoding="utf-8") as f:
        hierarchy = json.load(f)
    bts, sas = [], []
    for bt in hierarchy:
        bts.append({
            "id": bt["id"], "name": bt["name"], "market": bt["market"], "tier": bt["tier"],
            "lat": bt["lat"], "lng": bt["lng"], "annual_revenue_usd": bt["annualRevenue"], "sa_count": bt["saCount"],
        })
        for sa in bt["saPerformance"]:
            sas.append({
                "name": sa["name"], "boutique_name": bt["name"], "market": bt["market"],
                "clients": sa["clients"], "revenue_usd": sa["revenue"],
                "tenure_years": int(str(sa["tenure"]).replace("y", "")), "retention_rate": sa["retention"],
            })
    return pd.DataFrame(bts), pd.DataFrame(sas)


def filter_options() -> dict:
    df_bt, _ = _load()
    return {
        "markets": sorted(df_bt["market"].unique().tolist()),
        "tiers": sorted(df_bt["tier"].unique().tolist()),
        "boutiques": df_bt["name"].tolist(),
    }


def _apply(df_bt, markets, tiers):
    out = df_bt.copy()
    if markets:
        out = out[out["market"].isin(markets)]
    if tiers:
        out = out[out["tier"].isin(tiers)]
    return out


def _short(name: str) -> str:
    return name.split("Aurelle ")[-1]


def overview(markets=None, tiers=None) -> dict:
    df_bt, df_sa = _load()
    f = _apply(df_bt, markets or [], tiers or [])
    if f.empty:
        return {"empty": True}
    sa_f = df_sa[df_sa["boutique_name"].isin(f["name"])]

    sa_agg = df_sa.groupby("boutique_name").agg(
        avg_tenure=("tenure_years", "mean"),
        avg_retention=("retention_rate", "mean"),
        avg_sa_rev=("revenue_usd", "mean"),
    ).reset_index()
    radar_src = f.merge(sa_agg, left_on="name", right_on="boutique_name", how="left")

    top_bt = f.sort_values("annual_revenue_usd", ascending=False).iloc[0]["name"]

    return {
        "empty": False,
        "kpis": {
            "count": int(len(f)),
            "total_rev": float(f["annual_revenue_usd"].sum()),
            "top_bt": _short(top_bt),
            "sas": int(f["sa_count"].sum()),
        },
        "radar": {
            "metrics": ["Annual Revenue", "Sales Associates", "Avg SA Tenure", "Client Retention", "Avg SA Productivity"],
            "boutiques": [
                {
                    "name": _short(r["name"]),
                    "raw": [
                        float(r["annual_revenue_usd"]), float(r["sa_count"]),
                        float(r.get("avg_tenure") or 0), float(r.get("avg_retention") or 0),
                        float(r.get("avg_sa_rev") or 0),
                    ],
                }
                for _, r in radar_src.iterrows()
            ],
        },
        "map": [
            {"name": _short(r["name"]), "lat": float(r["lat"]), "lng": float(r["lng"]),
             "tier": r["tier"], "revenue": float(r["annual_revenue_usd"])}
            for _, r in f.iterrows()
        ],
        "sa_scatter": [
            {"name": r["name"], "tenure": int(r["tenure_years"]), "revenue": float(r["revenue_usd"]),
             "clients": int(r["clients"]), "retention": float(r["retention_rate"])}
            for _, r in sa_f.iterrows()
        ],
        "ranking": [
            {"name": _short(r["name"]), "market": r["market"], "tier": r["tier"],
             "sas": int(r["sa_count"]), "revenue": float(r["annual_revenue_usd"])}
            for _, r in f.sort_values("annual_revenue_usd", ascending=False).iterrows()
        ],
    }


def report_messages(markets=None, tiers=None) -> list:
    from utils.prompts import get_system_prompt

    df_bt, df_sa = _load()
    f = _apply(df_bt, markets or [], tiers or [])
    sa_f = df_sa[df_sa["boutique_name"].isin(f["name"])]
    total_rev = float(f["annual_revenue_usd"].sum())
    avg_rev = float(f["annual_revenue_usd"].mean())
    top_row = f.sort_values("annual_revenue_usd", ascending=False).iloc[0]
    actual_markets = f["market"].unique().tolist()
    actual_tiers = f["tier"].unique().tolist()

    if not sa_f.empty:
        top_sa = sa_f.sort_values("revenue_usd", ascending=False).iloc[0]
        sa_stats = {
            "total_sales_associates": int(len(sa_f)),
            "average_sa_annual_revenue_usd": f"${sa_f['revenue_usd'].mean():,.0f}",
            "average_clients_per_sa": f"{sa_f['clients'].mean():.1f}",
            "average_sa_tenure_years": f"{sa_f['tenure_years'].mean():.1f} years",
            "average_sa_retention_rate": f"{sa_f['retention_rate'].mean():.1f}%",
            "top_performing_sa": f"{top_sa['name']} ({top_sa['boutique_name']}) attributing ${top_sa['revenue_usd']:,.0f}",
        }
    else:
        sa_stats = {"total_sales_associates": 0}

    summary = {
        "scope": {"markets_in_data": actual_markets, "tiers_in_data": actual_tiers},
        "selected_boutiques_count": int(len(f)),
        "total_boutique_revenue_usd": f"${total_rev:,.0f}",
        "average_boutique_revenue_usd": f"${avg_rev:,.0f}",
        "top_performing_boutique": f"{top_row['name']} (${top_row['annual_revenue_usd']:,.0f} revenue)",
        **sa_stats,
    }
    user_prompt = (
        f"IMPORTANT SCOPE CONSTRAINT — The user has filtered the dashboard to ONLY:\n"
        f"  • Markets: {actual_markets}\n  • Tiers: {actual_tiers}\n"
        f"You MUST NOT reference any markets or tiers outside this list.\n\n"
        f"Boutique performance and SA productivity summary (filtered):\n{summary}"
    )
    return [
        {"role": "system", "content": get_system_prompt("boutique_insight")},
        {"role": "user", "content": user_prompt},
    ]
