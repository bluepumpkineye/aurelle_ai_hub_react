"""Headless Marketing Intelligence service (decoupled from marketing_budget.py)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


@lru_cache(maxsize=1)
def _df() -> pd.DataFrame:
    return pd.read_csv(DATA / "marketing_data.csv")


def filter_options() -> dict:
    df = _df()
    return {
        "markets": sorted(df["market"].dropna().unique().tolist()),
        "quarters": sorted(df["quarter"].dropna().unique().tolist()),
        "statuses": sorted(df["status"].dropna().unique().tolist()),
    }


def _apply(df, markets, quarters, statuses):
    out = df.copy()
    if markets:
        out = out[out["market"].isin(markets)]
    if quarters:
        out = out[out["quarter"].isin(quarters)]
    if statuses:
        out = out[out["status"].isin(statuses)]
    return out


def overview(markets=None, quarters=None, statuses=None) -> dict:
    df = _df()
    f = _apply(df, markets or [], quarters or [], statuses or [])
    if f.empty:
        return {"empty": True}

    total_budget = float(f["budget_usd"].sum())
    total_actual = float(f["actual_usd"].sum())
    variance = total_actual - total_budget
    avg_roi = float(f["roi"].mean())
    rev_attr = float(f["revenue_attributed"].sum())

    camp = f.groupby("campaign")[["budget_usd", "actual_usd"]].sum().reset_index().sort_values("budget_usd", ascending=False).head(8)
    media = f.groupby("media_type")["roi"].mean().reset_index().sort_values("roi")
    mkt = f.groupby("market")[["budget_usd", "actual_usd"]].sum()
    mkt["variance_pct"] = (mkt["actual_usd"] - mkt["budget_usd"]) / mkt["budget_usd"] * 100
    mkt = mkt.reset_index().sort_values("variance_pct")
    scatter = f.groupby("campaign").agg(
        impressions=("impressions", "sum"), revenue=("revenue_attributed", "sum"), roi=("roi", "mean")
    ).reset_index()

    detail = f[["campaign", "market", "media_type", "budget_usd", "actual_usd", "variance_pct", "roi", "status"]].sort_values("roi", ascending=False)

    return {
        "empty": False,
        "kpis": {
            "budget": total_budget, "actual": total_actual, "variance": variance,
            "variance_pct": (variance / total_budget * 100) if total_budget else 0,
            "avg_roi": avg_roi, "rev_attr": rev_attr,
        },
        "charts": {
            "campaigns": [{"name": r["campaign"], "budget": float(r["budget_usd"]), "actual": float(r["actual_usd"])} for _, r in camp.iterrows()],
            "media_roi": [{"name": r["media_type"], "roi": float(r["roi"])} for _, r in media.iterrows()],
            "market_variance": [{"name": r["market"], "variance_pct": float(r["variance_pct"])} for _, r in mkt.iterrows()],
            "scatter": [{"name": r["campaign"], "impressions": float(r["impressions"]), "revenue": float(r["revenue"]), "roi": float(r["roi"])} for _, r in scatter.iterrows()],
        },
        "detail": [
            {"campaign": r["campaign"], "market": r["market"], "media": r["media_type"],
             "budget": float(r["budget_usd"]), "actual": float(r["actual_usd"]),
             "variance_pct": float(r["variance_pct"]), "roi": float(r["roi"]), "status": r["status"]}
            for _, r in detail.head(40).iterrows()
        ],
    }


def report_messages(markets=None, quarters=None, statuses=None) -> list:
    from utils.prompts import get_system_prompt

    df = _df()
    f = _apply(df, markets or [], quarters or [], statuses or [])
    total_budget = float(f["budget_usd"].sum())
    total_actual = float(f["actual_usd"].sum())
    variance = total_actual - total_budget
    avg_roi = float(f["roi"].mean())
    actual_markets = f["market"].unique().tolist()
    actual_quarters = f["quarter"].unique().tolist()
    actual_statuses = f["status"].unique().tolist()
    summary = {
        "scope": {"markets_in_data": actual_markets, "quarters_in_data": actual_quarters, "statuses_in_data": actual_statuses},
        "total_budget": f"${total_budget/1e6:.1f}M",
        "total_actual": f"${total_actual/1e6:.1f}M",
        "variance": f"${variance/1e6:.1f}M ({variance/total_budget*100:.1f}%)" if total_budget else "n/a",
        "avg_roi": f"{avg_roi:.0f}%",
        "best_media": f.groupby("media_type")["roi"].mean().idxmax(),
        "worst_media": f.groupby("media_type")["roi"].mean().idxmin(),
        "over_budget_mkts": f[f["variance_pct"] > 0]["market"].unique().tolist(),
    }
    user_prompt = (
        f"IMPORTANT SCOPE CONSTRAINT — The user has filtered the dashboard to ONLY:\n"
        f"  • Markets: {actual_markets}\n  • Quarters: {actual_quarters}\n  • Campaign Status: {actual_statuses}\n"
        f"You MUST NOT reference any markets, quarters, or statuses outside this list.\n\n"
        f"Marketing performance data (filtered):\n{summary}"
    )
    return [
        {"role": "system", "content": get_system_prompt("marketing_intelligence")},
        {"role": "user", "content": user_prompt},
    ]
