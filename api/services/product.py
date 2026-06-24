"""Headless Product Performance service (decoupled from product_performance.py)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

_BANDS = [0, 1000, 5000, 20000, 50000, float("inf")]
_BAND_LABELS = ["Entry (<$1K)", "Aspirational ($1K-$5K)", "Core Luxury ($5K-$20K)", "Prestige ($20K-$50K)", "High Jewellery (>$50K)"]


@lru_cache(maxsize=1)
def _df() -> pd.DataFrame:
    df = pd.read_csv(DATA / "sales_data.csv")
    df["date"] = pd.to_datetime(df["date"])
    return df


def filter_options() -> dict:
    df = _df()
    return {
        "markets": sorted(df["market"].dropna().unique().tolist()),
        "channels": sorted(df["channel"].dropna().unique().tolist()),
        "categories": sorted(df["category"].dropna().unique().tolist()),
    }


def _apply(df, markets, channels, categories):
    out = df.copy()
    if markets:
        out = out[out["market"].isin(markets)]
    if channels:
        out = out[out["channel"].isin(channels)]
    if categories:
        out = out[out["category"].isin(categories)]
    return out


def _coll(f: pd.DataFrame) -> pd.DataFrame:
    return f.groupby("product").agg(
        revenue=("revenue_usd", "sum"),
        margin=("gross_margin", "mean"),
        units=("units_sold", "sum"),
    ).reset_index()


def overview(markets=None, channels=None, categories=None) -> dict:
    df = _df()
    f = _apply(df, markets or [], channels or [], categories or [])
    if f.empty:
        return {"empty": True}

    total_rev = float(f["revenue_usd"].sum())
    coll = _coll(f)

    # price bands
    f = f.copy()
    f["price_band"] = pd.cut(f["revenue_usd"] / f["units_sold"], bins=_BANDS, labels=_BAND_LABELS)
    band = f.groupby("price_band", observed=False).agg(
        transactions=("revenue_usd", "count"), revenue=("revenue_usd", "sum")
    ).reset_index()

    # cross-purchase co-occurrence
    client_cats = f.groupby("client_id")["category"].unique()
    client_cats = client_cats[~client_cats.index.astype(str).str.contains("WALK")]
    cats = sorted(f["category"].unique().tolist())
    idx = {c: i for i, c in enumerate(cats)}
    matrix = [[0] * len(cats) for _ in cats]
    for user_cats in client_cats:
        for a in user_cats:
            for b in user_cats:
                matrix[idx[a]][idx[b]] += 1

    return {
        "empty": False,
        "kpis": {
            "total_rev": total_rev,
            "units": int(f["units_sold"].sum()),
            "atv": float(f["revenue_usd"].mean()),
            "margin": float(f["gross_margin"].mean()),
            "top_product": f.groupby("product")["revenue_usd"].sum().idxmax(),
        },
        "charts": {
            "by_product": [{"name": r["product"], "value": float(r["revenue"])} for _, r in coll.sort_values("revenue", ascending=False).iterrows()],
            "bands": [{"name": str(r["price_band"]), "transactions": int(r["transactions"]), "revenue": float(r["revenue"])} for _, r in band.iterrows()],
            "scatter": [{"name": r["product"], "units": int(r["units"]), "margin": float(r["margin"]), "revenue": float(r["revenue"])} for _, r in coll.iterrows()],
            "matrix": {"labels": cats, "rows": matrix},
        },
    }


def report_messages(markets=None, channels=None, categories=None) -> list:
    from utils.prompts import get_system_prompt

    df = _df()
    f = _apply(df, markets or [], channels or [], categories or [])
    coll = _coll(f)
    total_rev = float(f["revenue_usd"].sum())
    avg_margin = float(f["gross_margin"].mean())
    top_product = f.groupby("product")["revenue_usd"].sum().idxmax()
    actual_categories = f["category"].unique().tolist()
    actual_channels = f["channel"].unique().tolist()
    actual_markets = f["market"].unique().tolist()

    breakdown = [
        {"product": r["product"], "revenue_usd": f"${r['revenue']:,.0f}",
         "avg_margin_pct": f"{r['margin']:.1f}%", "units_sold": int(r["units"])}
        for _, r in coll.iterrows()
    ]
    summary = {
        "scope": {"categories_in_data": actual_categories, "channels_in_data": actual_channels, "markets_in_data": actual_markets},
        "total_revenue": f"${total_rev/1e6:.1f}M",
        "average_margin": f"{avg_margin:.1f}%",
        "top_selling_product": top_product,
        "lowest_volume_product": coll.sort_values("units").iloc[0]["product"],
        "highest_margin_product": coll.sort_values("margin", ascending=False).iloc[0]["product"],
        "product_breakdown": breakdown,
    }
    user_prompt = (
        f"IMPORTANT SCOPE CONSTRAINT — The user has filtered the dashboard to ONLY the following:\n"
        f"  • Categories: {actual_categories}\n  • Channels: {actual_channels}\n  • Markets: {actual_markets}\n"
        f"You MUST NOT mention, reference, or recommend strategies involving any categories, channels, "
        f"or markets outside this list.\n\nProduct performance metrics (filtered):\n{summary}"
    )
    return [
        {"role": "system", "content": get_system_prompt("merchandising_advisor")},
        {"role": "user", "content": user_prompt},
    ]
