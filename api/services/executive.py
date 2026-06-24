"""Headless Executive Dashboard service (decoupled from app.py's render_dashboard)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

_MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@lru_cache(maxsize=1)
def _kpis() -> dict:
    with open(DATA / "kpis.json", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _sales() -> pd.DataFrame:
    df = pd.read_csv(DATA / "sales_data.csv")
    df["date"] = pd.to_datetime(df["date"])
    return df


@lru_cache(maxsize=1)
def _crm() -> pd.DataFrame:
    return pd.read_csv(DATA / "crm_data.csv")


def overview() -> dict:
    k = _kpis()
    sales = _sales()
    crm = _crm()

    revenue = k["total_revenue_ytd_usd"]
    target_pct = k["revenue_vs_target_pct"]
    target_rev = revenue / (1 + target_pct / 100) if target_pct != -100 else revenue
    ahead = revenue - target_rev
    at_risk_book = float(crm.loc[crm["churn_risk"] == "High", "lifetime_value_usd"].sum())
    at_risk_n = int((crm["churn_risk"] == "High").sum())
    digital_share = k.get("digital_revenue_share_pct", 0)
    digital_rev = revenue * digital_share / 100
    tr_growth = k.get("travel_retail_growth_pct", 0)

    priorities = [
        {
            "label": "Ahead of Plan",
            "amount": ahead,
            "sub": f"+{target_pct}% vs target — protect momentum in {k.get('top_market', 'top markets')}.",
            "tone": "positive",
        },
        {
            "label": "Client Value at Risk",
            "amount": at_risk_book,
            "sub": f"{at_risk_n:,} high-churn clients dormant — mobilise VIP outreach this week.",
            "tone": "risk",
        },
        {
            "label": "Digital Growth Engine",
            "amount": digital_rev,
            "sub": f"{digital_share}% of revenue · Travel Retail +{tr_growth}% — scale highest-ROI channels.",
            "tone": "opportunity",
        },
    ]

    kpi_strip = [
        {"label": "YTD Revenue", "value": f"${revenue/1e6:.0f}M", "delta": f"+{target_pct}% vs target"},
        {"label": "Gross Margin", "value": f"{k['gross_margin_pct']}%"},
        {"label": "APAC Clients", "value": f"{k['total_clients_apac']:,}"},
        {"label": "NPS Score", "value": f"{k['nps_score']}"},
        {"label": "Digital Share", "value": f"{digital_share}%", "delta": f"+{tr_growth}% Travel Retail"},
        {"label": "New Clients YTD", "value": f"{k['new_clients_ytd']:,}"},
        {"label": "VIP Clients", "value": f"{k['vip_clients']:,}"},
        {"label": "Avg Transaction", "value": f"${k['avg_transaction_value_usd']:,.0f}"},
        {"label": "Client Retention", "value": f"{k['client_retention_rate']*100:.1f}%"},
    ]

    by_market = (
        sales.groupby("market")["revenue_usd"].sum().sort_values(ascending=False).reset_index()
    )
    by_category = sales.groupby("category")["revenue_usd"].sum().reset_index()
    seg_mix = crm.groupby("segment").size().reset_index(name="count")

    trend_df = sales.groupby("month")["revenue_usd"].sum()
    trend = [
        {"name": _MONTH_ORDER[int(m) - 1], "value": float(trend_df.get(m, 0))}
        for m in range(1, 13)
        if m in trend_df.index
    ]

    return {
        "priorities": priorities,
        "kpis": kpi_strip,
        "charts": {
            "by_market": [{"name": r["market"], "value": float(r["revenue_usd"])} for _, r in by_market.iterrows()],
            "by_category": [{"name": r["category"], "value": float(r["revenue_usd"])} for _, r in by_category.iterrows()],
            "segment_mix": [{"name": r["segment"], "value": int(r["count"])} for _, r in seg_mix.iterrows()],
            "trend": trend,
        },
        "context": {"at_risk_book": at_risk_book, "tr_growth": tr_growth},
    }


def report_messages() -> list:
    from utils.prompts import get_system_prompt

    k = _kpis()
    summary = f"""
    YTD Revenue: ${k['total_revenue_ytd_usd']/1e6:.0f}M
    vs Target: +{k['revenue_vs_target_pct']}%
    Top Market: {k['top_market']}
    Top Category: {k['top_category']}
    NPS: {k['nps_score']}
    Client Retention: {k['client_retention_rate']*100:.1f}%
    Digital Revenue Share: {k['digital_revenue_share_pct']}%
    VIP Clients: {k['vip_clients']:,} of {k['total_clients_apac']:,} total
    """
    return [
        {"role": "system", "content": get_system_prompt("morning_brief")},
        {"role": "user", "content": f"APAC Performance Data:\n{summary}"},
    ]
