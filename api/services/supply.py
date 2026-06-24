"""Headless Demand & Supply Planning service (decoupled from demand_planning.py)."""
from __future__ import annotations

import json
from datetime import datetime, date, timedelta
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from utils.forecasting import calculate_base_velocity, apply_seasonality, calculate_supply_timeline, run_reallocation_scenario
from data.generate_data import BOUTIQUES

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

_TIER_MULT = {"Flagship": 3.0, "Major": 2.0, "Premium": 2.0, "Standard": 1.0}
_SEASON_FALLBACK = {1: 1.45, 2: 1.40, 3: 1.00, 4: 0.95, 5: 1.10, 6: 0.90,
                    7: 0.75, 8: 0.80, 9: 1.15, 10: 1.25, 11: 1.10, 12: 1.35}

# SKU to product mapping for backward compatibility and data distribution
SKU_TO_PRODUCT = {
    "HJ-PANTHERE-NECK": "Maison Panthère Necklace",
    "HJ-TRINITY-CUFF": "Trinity HJ Cuff",
    "HJ-CACTUS-COLL": "Cactus de Aurelle Collier",
    "HJ-LOVE-BRAC": "LOVE Bracelet HJ",
    "W-SANTOS-M-SS-BLK": "Santos de Aurelle",
    "W-SANTOS-L-YG-BRN": "Santos de Aurelle",
    "W-SANTOS-L-SS-WHT": "Santos de Aurelle",
    "W-TANK-S-SS-WHT": "Tank Must",
    "W-TANK-L-SS-BLK": "Tank Must",
    "W-TANK-M-YG-SLV": "Tank Must",
    "W-BBLUE-M-SS-BLU": "Ballon Bleu de Aurelle",
    "W-BBLUE-L-YG-SLV": "Ballon Bleu de Aurelle",
    "W-BBLUE-S-SS-PNK": "Ballon Bleu de Aurelle",
    "W-PANTHERE-S-YG-WHT": "Panthère de Aurelle Watch",
    "W-PANTHERE-M-SS-SLV": "Panthère de Aurelle Watch",
    "W-PANTHERE-S-SS-SLV": "Panthère de Aurelle Watch",
    "W-BAIGNOIRE-XS-YG": "Baignoire Watch",
    "W-BAIGNOIRE-S-WG-DM": "Baignoire Watch",
    "W-BAIGNOIRE-M-YG": "Baignoire Watch",
    "J-LOVE-BRAC-YG": "LOVE Bracelet Classic",
    "J-LOVE-BRAC-WG": "LOVE Bracelet Classic",
    "J-LOVE-BRAC-PG": "LOVE Bracelet Classic",
    "J-LOVE-RING-YG": "LOVE Bracelet Classic",
    "J-LOVE-RING-WG": "LOVE Bracelet Classic",
    "J-JUC-BRAC-YG": "Juste un Clou Bracelet",
    "J-JUC-BRAC-WG": "Juste un Clou Bracelet",
    "J-JUC-RING-YG": "Juste un Clou Bracelet",
    "J-CLASH-RING-RG": "Clash de Aurelle Ring",
    "J-CLASH-RING-WG": "Clash de Aurelle Ring",
    "J-CLASH-BRAC-RG": "Clash de Aurelle Ring",
    "J-TRINITY-RING-CL": "Trinity Ring Classic",
    "J-TRINITY-RING-LM": "Trinity Ring Classic",
    "J-TRINITY-BRAC-CL": "Trinity Ring Classic",
    "J-DAMOUR-NECK-WG": "Aurelle d'Amour Necklace",
    "J-DAMOUR-NECK-YG": "Aurelle d'Amour Necklace"
}

@lru_cache(maxsize=1)
def _df() -> pd.DataFrame:
    return pd.read_csv(DATA / "supply_data.csv")

@lru_cache(maxsize=1)
def _sales_df() -> pd.DataFrame:
    return pd.read_csv(DATA / "sales_data.csv")

@lru_cache(maxsize=1)
def _targets_df() -> pd.DataFrame:
    return pd.read_csv(DATA / "model_stock_targets.csv")

@lru_cache(maxsize=1)
def _inbound_df() -> pd.DataFrame:
    return pd.read_csv(DATA / "inbound_shipments.csv")

@lru_cache(maxsize=1)
def _meta_df() -> pd.DataFrame:
    return pd.read_csv(DATA / "boutique_metadata.csv")

@lru_cache(maxsize=1)
def _tier_map() -> dict:
    with open(DATA / "boutiques_hierarchy.json", encoding="utf-8") as f:
        return {b["id"]: b["tier"] for b in json.load(f)}

def _short(name: str) -> str:
    return name.split("Aurelle ")[-1]

def filter_options() -> dict:
    df = _df()
    return {
        "categories": sorted(df["category"].dropna().unique().tolist()),
        "markets": sorted(df["market"].dropna().unique().tolist()),
        "risks": ["High", "Medium", "Low"],
        "products": sorted(df["product"].dropna().unique().tolist()),
    }

def _apply(df, category, market, risks):
    out = df.copy()
    if category and category != "All":
        out = out[out["category"] == category]
    if market and market != "All":
        out = out[out["market"] == market]
    if risks:
        out = out[out["stockout_risk"].isin(risks)]
    return out

def _forecast() -> dict:
    df = _df()
    unique_dates = sorted(df["date"].unique())
    last_date = datetime.strptime(str(unique_dates[-1]), "%Y-%m-%d")
    future = [last_date + timedelta(days=30 * i) for i in range(1, 7)]
    periods = [f"M+{i} ({d.strftime('%b')})" for i, d in enumerate(future, 1)]

    rows = {p: {"period": p} for p in periods}
    cats = df["category"].unique().tolist()
    for cat in cats:
        cm = df[df["category"] == cat].groupby("date")["actual_demand"].mean().reset_index()
        cm["dp"] = pd.to_datetime(cm["date"])
        cm = cm.sort_values("dp").reset_index(drop=True)
        cm["t"] = range(len(cm))
        X = cm["t"].values.reshape(-1, 1)
        y = cm["actual_demand"].values
        model = LinearRegression().fit(X, y)
        trend_hist = model.predict(X)
        cm["month"] = cm["dp"].dt.month
        cm["sr"] = cm["actual_demand"] / np.clip(trend_hist, 1.0, None)
        seasonal = cm.groupby("month")["sr"].mean().to_dict()
        for m in range(1, 13):
            seasonal.setdefault(m, _SEASON_FALLBACK.get(m, 1.0))
        for i, d in enumerate(future, 1):
            tp = model.predict([[len(cm) + (i - 1)]])[0]
            np.random.seed(abs(hash(cat)) % 1234567 + i)
            pred = tp * seasonal.get(d.month, 1.0) * np.random.uniform(0.97, 1.03)
            rows[periods[i - 1]][cat] = max(0.0, round(float(pred), 1))
    return {"categories": cats, "data": [rows[p] for p in periods]}

def overview(category=None, market=None, risks=None) -> dict:
    df = _df()
    f = _apply(df, category, market, risks or ["High", "Medium", "Low"])

    high_stockout = int((f["stockout_risk"] == "High").sum())
    high_overstock = int((f["overstock_risk"] == "High").sum())
    avg_cover = float(f["stock_cover_weeks"].mean()) if len(f) else 0.0
    avg_lead = float(f["lead_time_days"].mean()) if len(f) else 0.0

    cat_comp = df.groupby("category")[["forecast_demand", "actual_demand"]].mean().reset_index()
    risk_mkt = df.groupby(["market", "stockout_risk"]).size().reset_index(name="count")
    markets = sorted(df["market"].unique().tolist())
    risk_stack = []
    for m in markets:
        row = {"market": m}
        for r in ["High", "Medium", "Low"]:
            v = risk_mkt[(risk_mkt["market"] == m) & (risk_mkt["stockout_risk"] == r)]["count"]
            row[r] = int(v.iloc[0]) if len(v) else 0
        risk_stack.append(row)

    critical = (
        f[f["stockout_risk"] == "High"][
            ["product", "market", "category", "stock_available", "forecast_demand", "stock_cover_weeks", "lead_time_days"]
        ].sort_values("stock_cover_weeks").head(15)
    )

    return {
        "kpis": {"high_stockout": high_stockout, "high_overstock": high_overstock,
                 "avg_cover": avg_cover, "avg_lead": avg_lead},
        "charts": {
            "forecast_actual": [
                {"category": r["category"], "forecast": float(r["forecast_demand"]), "actual": float(r["actual_demand"])}
                for _, r in cat_comp.iterrows()
            ],
            "risk_by_market": risk_stack,
            "forecast": _forecast(),
        },
        "critical": [
            {"product": r["product"], "market": r["market"], "category": r["category"],
             "stock": int(r["stock_available"]), "forecast": float(r["forecast_demand"]),
             "cover": float(r["stock_cover_weeks"]), "lead": int(r["lead_time_days"])}
            for _, r in critical.iterrows()
        ],
    }

def allocate(product: str, total_units: int, w_wait=0.45, w_vel=0.30, w_tier=0.15, w_cover=0.10) -> dict:
    df = _df()
    prod = df[df["product"] == product].copy()
    if prod.empty:
        return {"records": []}
    prod["date"] = pd.to_datetime(prod["date"])
    latest = prod[prod["date"] == prod["date"].max()].copy()

    tmap = _tier_map()
    latest["tier"] = latest["boutique_id"].map(tmap).fillna("Standard")
    latest["tier_score"] = latest["tier"].map(lambda t: _TIER_MULT.get(t, 1.0))
    latest["opt_score"] = (
        latest["waitlist_count"] * w_wait
        + latest["sales_velocity"] * w_vel * 4
        + latest["tier_score"] * w_tier * 5
        + (10.0 - latest["stock_cover_weeks"].clip(upper=10.0)) * w_cover * 3
    )
    total_score = latest["opt_score"].sum()
    latest["frac"] = latest["opt_score"] / total_score if total_score > 0 else 1.0 / len(latest)
    latest["allocated"] = (latest["frac"] * total_units).round().astype(int)
    diff = total_units - int(latest["allocated"].sum())
    if diff != 0:
        latest.loc[latest["opt_score"].idxmax(), "allocated"] += diff
    latest["post_stock"] = latest["stock_available"] + latest["allocated"]
    latest["post_cover"] = (latest["post_stock"] / latest["sales_velocity"].clip(lower=0.25)).round(1)

    latest = latest.sort_values("allocated", ascending=False)
    return {
        "product": product,
        "records": [
            {"boutique": _short(r["boutique_name"]), "tier": r["tier"], "stock": int(r["stock_available"]),
             "waitlist": int(r["waitlist_count"]), "velocity": round(float(r["sales_velocity"]), 1),
             "allocated": int(r["allocated"]), "post_cover": float(r["post_cover"])}
            for _, r in latest.iterrows()
        ],
    }

def report_messages(category=None, market=None, risks=None) -> list:
    from utils.prompts import get_system_prompt

    df = _df()
    f = _apply(df, category, market, risks or ["High", "Medium", "Low"])
    high_stockout = int((f["stockout_risk"] == "High").sum())
    high_overstock = int((f["overstock_risk"] == "High").sum())
    actual_categories = f["category"].unique().tolist()
    actual_markets = f["market"].unique().tolist()
    actual_risks = f["stockout_risk"].unique().tolist()
    high_df = f[f["stockout_risk"] == "High"]
    worst_cat = (f.groupby("category")["stockout_risk"].apply(lambda x: (x == "High").mean()).idxmax()
                 if not high_df.empty else "N/A")
    worst_mkt = (f.groupby("market")["stockout_risk"].apply(lambda x: (x == "High").mean()).idxmax()
                 if not high_df.empty else "N/A")
    summary = {
        "scope": {"categories_in_data": actual_categories, "markets_in_data": actual_markets, "risk_levels_in_data": actual_risks},
        "high_stockout_skus": high_stockout, "high_overstock_skus": high_overstock,
        "avg_stock_cover_wks": round(float(f["stock_cover_weeks"].mean()), 1) if len(f) else 0,
        "avg_lead_time_days": round(float(f["lead_time_days"].mean()), 0) if len(f) else 0,
        "worst_category": worst_cat, "worst_market": worst_mkt,
    }
    user_prompt = (
        f"IMPORTANT SCOPE CONSTRAINT — The user has filtered the dashboard to ONLY:\n"
        f"  • Categories: {actual_categories}\n  • Markets: {actual_markets}\n  • Risk Levels: {actual_risks}\n"
        f"You MUST NOT reference any categories, markets, or risk levels outside this list.\n\n"
        f"Supply chain data (filtered):\n{summary}"
    )
    return [
        {"role": "system", "content": get_system_prompt("supply_chain_report")},
        {"role": "user", "content": user_prompt},
    ]

def allocation_report_messages(product: str, weights: dict, records: list) -> list:
    from utils.prompts import get_system_prompt

    alloc = [{"boutique_name": r["boutique"], "waitlist_count": r["waitlist"],
              "allocated_units": r["allocated"], "post_cover_weeks": r["post_cover"]} for r in records]
    user_prompt = (
        f"Product: {product}\nWeights used: Waitlist={weights.get('w_wait')}, Velocity={weights.get('w_vel')}, "
        f"Tier={weights.get('w_tier')}, Cover={weights.get('w_cover')}\nAllocations: {alloc}"
    )
    return [
        {"role": "system", "content": get_system_prompt("allocation_advisor")},
        {"role": "user", "content": user_prompt},
    ]

# ── 1. Model Stock Service ──
def distribute_stock_helper(boutique_id, product_name, total_stock, skus_list, targets_list):
    n = len(skus_list)
    if n == 0:
        return []
    if total_stock <= 0:
        return [0] * n
    sum_targets = sum(targets_list)
    if sum_targets == 0:
        base = [total_stock // n] * n
        for i in range(total_stock % n):
            base[i] += 1
        return base
    alloc = [int(round((t / sum_targets) * total_stock)) for t in targets_list]
    diff = total_stock - sum(alloc)
    if diff != 0:
        max_idx = targets_list.index(max(targets_list))
        alloc[max_idx] = max(0, alloc[max_idx] + diff)
    return alloc

def compute_model_stock_metrics(df_enriched):
    boutique_stats = df_enriched.groupby('boutique_id').agg(
        total_actual=('stock_available', 'sum'),
        total_target=('model_stock_target', 'sum')
    )
    # Avoid zero division
    boutique_stats['achievement'] = (boutique_stats['total_actual'] / boutique_stats['total_target'].clip(lower=1.0)) * 100
    boutiques_on_target = len(boutique_stats[boutique_stats['achievement'] >= 90.0])
    total_boutiques = len(boutique_stats)
    pct_on_target = (boutiques_on_target / total_boutiques * 100) if total_boutiques > 0 else 0.0
    
    critical_gaps = len(df_enriched[(df_enriched['stock_available'] == 0) & (df_enriched['model_stock_target'] > 0)])
    
    over_stock_positions = len(df_enriched[df_enriched['stock_available'] > 1.4 * df_enriched['model_stock_target']])
    
    excess_df = df_enriched[df_enriched['stock_available'] > df_enriched['model_stock_target']]
    capital_at_risk = sum((excess_df['stock_available'] - excess_df['model_stock_target']) * excess_df['unit_cost_usd'])
    
    return {
        "boutiques_on_target": boutiques_on_target,
        "boutiques_total": total_boutiques,
        "pct_on_target": pct_on_target,
        "critical_gaps": critical_gaps,
        "over_stock_positions": over_stock_positions,
        "capital_at_risk": capital_at_risk
    }

def get_enriched_model_stock(date_str: str) -> pd.DataFrame:
    targets_df = _targets_df().copy()
    supply_df = _df().copy()
    
    supply_date_df = supply_df[supply_df['date'] == date_str]
    if supply_date_df.empty:
        supply_date_df = supply_df[supply_df['date'] == supply_df['date'].max()]
        
    supply_map = {}
    for _, row in supply_date_df.iterrows():
        key = (row['boutique_id'], row['product'])
        supply_map[key] = (row['stock_available'], row['sales_velocity'], row['unit_cost_usd'])
        
    targets_df['parent_product'] = targets_df['reference_sku'].map(SKU_TO_PRODUCT)
    
    sku_stocks = []
    sku_velocities = []
    
    for (bid, prod), group in targets_df.groupby(['boutique_id', 'parent_product']):
        prod_stock, prod_vel, _ = supply_map.get((bid, prod), (0, 0.0, 0.0))
        skus = group['reference_sku'].tolist()
        targets = group['model_stock_target'].tolist()
        
        stocks = distribute_stock_helper(bid, prod, int(prod_stock), skus, targets)
        sum_targets = sum(targets)
        if sum_targets > 0:
            velocities = [round((t / sum_targets) * prod_vel, 2) for t in targets]
        else:
            velocities = [0.0] * len(skus)
            
        for sku, stock, vel in zip(skus, stocks, velocities):
            sku_stocks.append(((bid, sku), stock))
            sku_velocities.append(((bid, sku), vel))
            
    stock_lookup = dict(sku_stocks)
    velocity_lookup = dict(sku_velocities)
    
    targets_df['stock_available'] = targets_df.apply(lambda r: stock_lookup.get((r['boutique_id'], r['reference_sku']), 0), axis=1)
    targets_df['sales_velocity'] = targets_df.apply(lambda r: velocity_lookup.get((r['boutique_id'], r['reference_sku']), 0.0), axis=1)
    
    return targets_df

def model_stock_filters() -> dict:
    targets = _targets_df()
    dates = sorted(_df()["date"].dropna().unique().tolist())
    return {
        "markets": sorted(targets["market"].dropna().unique().tolist()),
        "boutiques": sorted(targets["boutique_name"].dropna().unique().tolist()),
        "categories": ["All", "Watches", "Fine Jewellery", "High Jewellery"],
        "collections": sorted(targets["collection"].dropna().unique().tolist()),
        "tiers": sorted(targets["boutique_tier"].dropna().unique().tolist()),
        "dates": dates
    }

def model_stock_overview(filters: dict) -> dict:
    as_of = filters.get("as_of_date")
    markets_f = filters.get("markets", [])
    boutiques_f = filters.get("boutiques", [])
    category_f = filters.get("category", "All")
    collections_f = filters.get("collections", [])
    tier_f = filters.get("tier", "All")
    show_only_f = filters.get("show_only", "All")

    df_enriched = get_enriched_model_stock(as_of)
    filtered = df_enriched.copy()
    
    if markets_f:
        filtered = filtered[filtered["market"].isin(markets_f)]
    if boutiques_f:
        filtered = filtered[filtered["boutique_name"].isin(boutiques_f)]
    if category_f != "All":
        filtered = filtered[filtered["category"] == category_f]
    if collections_f:
        filtered = filtered[filtered["collection"].isin(collections_f)]
    if tier_f != "All":
        filtered = filtered[filtered["boutique_tier"] == tier_f]
        
    if show_only_f == "Under-stocked boutiques only":
        filtered = filtered[filtered["stock_available"] < filtered["model_stock_target"]]
    elif show_only_f == "Missing references only":
        filtered = filtered[(filtered["stock_available"] == 0) & (filtered["model_stock_target"] > 0)]
    elif show_only_f == "Over-stocked only":
        filtered = filtered[filtered["stock_available"] > 1.4 * filtered["model_stock_target"]]

    # KPIs
    metrics = compute_model_stock_metrics(filtered)
    
    # Heatmap sorting and arrays
    df_m = _meta_df()
    df_sorted = df_m[df_m["boutique_name"].isin(filtered["boutique_name"].unique())].copy()
    tier_order = {"Flagship Maison": 0, "Flagship": 1, "Standard": 2, "Emerging": 3}
    df_sorted["t_idx"] = df_sorted["boutique_tier"].map(tier_order)
    df_sorted = df_sorted.sort_values(by=["t_idx", "market", "boutique_name"])
    
    sorted_boutique_names = df_sorted["boutique_name"].tolist()
    sorted_boutique_ids = df_sorted["boutique_id"].tolist()
    
    collection_list = ["Santos", "Tank", "Ballon Bleu", "Panthère", "Baignoire", 
                       "Love", "Juste un Clou", "Clash", "Trinity", "Aurelle d'Amour", "High Jewellery"]
    active_collections = [c for c in collection_list if c in filtered["collection"].unique()]
    
    ach_matrix = []
    text_matrix = []
    hover_matrix = []
    
    for col in active_collections:
        ach_row, txt_row, hvr_row = [], [], []
        for bid in sorted_boutique_ids:
            cell = filtered[(filtered["boutique_id"] == bid) & (filtered["collection"] == col)]
            bt_name = next(b["name"] for b in BOUTIQUES if b["id"] == bid)
            if cell.empty:
                ach_row.append(None)
                txt_row.append("")
                hvr_row.append(f"Boutique: {bt_name}<br>Collection: {col}<br>No stock target defined.")
            else:
                actual = int(cell["stock_available"].sum())
                target = int(cell["model_stock_target"].sum())
                cost = float(cell["unit_cost_usd"].mean())
                vel = float(cell["sales_velocity"].sum())
                
                ach_pct = (actual / target * 100) if target > 0 else 0.0
                ach_row.append(round(ach_pct, 1))
                txt_row.append(f"{actual}/{target}")
                
                gap = target - actual
                gap_val = gap * cost
                days_cover = round(actual / (vel / 7.0), 1) if vel > 0 else "N/A"
                
                hvr_row.append(
                    f"Boutique: {_short(bt_name)}<br>Collection: {col}<br>Actual: {actual} | Target: {target}<br>"
                    f"Gap: {gap} (${gap_val:,.0f})<br>Velocity: {vel:.1f}/wk | Cover: {days_cover}d"
                )
        ach_matrix.append(ach_row)
        text_matrix.append(txt_row)
        hover_matrix.append(hvr_row)

    # Category deep dive progress bars
    cat_breakdowns = {}
    for cat in ["Watches", "Fine Jewellery", "High Jewellery"]:
        cat_df = filtered[filtered["category"] == cat]
        if cat_df.empty:
            continue
        total_t = int(cat_df["model_stock_target"].sum())
        total_a = int(cat_df["stock_available"].sum())
        ach = (total_a / total_t * 100) if total_t > 0 else 0.0
        
        breakdowns = []
        for col in cat_df["collection"].unique():
            col_df = cat_df[cat_df["collection"] == col]
            col_t = int(col_df["model_stock_target"].sum())
            col_a = int(col_df["stock_available"].sum())
            col_gap = max(0, col_t - col_a)
            col_gap_val = col_gap * col_df["unit_cost_usd"].mean()
            col_zeros = len(col_df[(col_df["stock_available"] == 0) & (col_df["model_stock_target"] > 0)]["boutique_id"].unique())
            
            # SKU details
            skus_df = col_df.groupby(["reference_sku", "reference_name"]).agg(
                Target=("model_stock_target", "sum"),
                Actual=("stock_available", "sum")
            ).reset_index()
            skus_df["Gap"] = skus_df["Target"] - skus_df["Actual"]
            
            breakdowns.append({
                "collection": col,
                "target": col_t,
                "actual": col_a,
                "gap": col_gap,
                "gap_value": round(col_gap_val, 2),
                "zeros": col_zeros,
                "skus": skus_df.to_dict('records')
            })
            
        cat_breakdowns[cat] = {
            "achievement": round(ach, 1),
            "total_target": total_t,
            "total_actual": total_a,
            "breakdowns": sorted(breakdowns, key=lambda x: x["gap"], reverse=True)
        }

    # Detailed SKU Gaps Registry
    df_gap = filtered.copy()
    df_gap["gap"] = df_gap["model_stock_target"] - df_gap["stock_available"]
    df_gap["gap_value"] = df_gap["gap"] * df_gap["unit_cost_usd"]
    df_gap["weeks_stockout"] = df_gap.apply(
        lambda r: r["stock_available"] / r["sales_velocity"] if r["sales_velocity"] > 0 else 999.0, axis=1
    )
    df_gap["lead_factor"] = df_gap["market"].apply(
        lambda m: 1.0 if m in ["Singapore", "Australia", "India", "Thailand"] else 1.5
    )
    df_gap["weeks_val"] = df_gap.apply(
        lambda r: max(r["stock_available"] / r["sales_velocity"], 0.1) if r["sales_velocity"] > 0 else 999.0, axis=1
    )
    df_gap["urgency_score"] = df_gap.apply(
        lambda r: (r["gap"] / r["model_stock_target"]) * (1.0 / r["weeks_val"]) * r["lead_factor"] if r["model_stock_target"] > 0 else 0.0, axis=1
    )
    
    inb_filt = _inbound_df()[_inbound_df()["shipment_status"] != "Delayed"]
    inb_agg = inb_filt.groupby(["destination_boutique", "reference_sku"])["units_ordered"].sum().to_dict()
    df_gap["inbound_units"] = df_gap.apply(
        lambda r: inb_agg.get((r["boutique_name"], r["reference_sku"]), 0), axis=1
    )
    df_gap["net_gap"] = df_gap["gap"] - df_gap["inbound_units"]
    
    # Action labels
    df_gap["urgency"] = df_gap.apply(
        lambda r: "OVER-STOCKED" if r["gap"] < 0 else "CRITICAL" if r["urgency_score"] > 2.0 else "HIGH" if r["urgency_score"] >= 1.0 else "MEDIUM" if r["urgency_score"] >= 0.5 else "LOW", axis=1
    )
    df_gap["action"] = df_gap.apply(
        lambda r: "Consider reallocation" if r["gap"] < 0 else "Inbound resolves gap" if r["net_gap"] <= 0 else "File emergency request (DOC-004)" if r["urgency"] == "CRITICAL" else "Schedule replenishment" if r["urgency"] == "HIGH" else "Monitor — inbound covers", axis=1
    )
    
    gaps_records = df_gap[[
        "reference_sku", "reference_name", "collection", "boutique_name", "market",
        "model_stock_target", "stock_available", "gap", "gap_value", "sales_velocity",
        "weeks_stockout", "inbound_units", "net_gap", "urgency", "action"
    ]].sort_values("gap", ascending=False).to_dict('records')

    return {
        "kpis": {
            "on_target": metrics["boutiques_on_target"],
            "total_boutiques": metrics["boutiques_total"],
            "pct_on_target": round(metrics["pct_on_target"], 1),
            "critical_gaps": metrics["critical_gaps"],
            "overstock_positions": metrics["over_stock_positions"],
            "capital_at_risk": round(metrics["capital_at_risk"], 2)
        },
        "heatmap": {
            "boutiques": [_short(n) for n in sorted_boutique_names],
            "collections": active_collections,
            "achievement": ach_matrix,
            "text": text_matrix,
            "hover": hover_matrix
        },
        "category_deep_dive": cat_breakdowns,
        "gaps_registry": gaps_records
    }

def model_stock_report_messages(filters: dict) -> list:
    overview_data = model_stock_overview(filters)
    k = overview_data["kpis"]
    gaps = overview_data["gaps_registry"][:5]
    over = [g for g in overview_data["gaps_registry"] if g["gap"] < 0][:3]
    
    cat_summary = {}
    for cat, details in overview_data["category_deep_dive"].items():
        cat_summary[cat] = {
            "target_units": details["total_target"],
            "actual_units": details["total_actual"],
            "gap_units": details["total_target"] - details["total_actual"],
            "gap_value_usd": sum(b["gap_value"] for b in details["breakdowns"]),
            "collections_at_zero": [b["collection"] for b in details["breakdowns"] if b["zeros"] > 0]
        }
        
    ai_dict = {
        "as_of_date": filters.get("as_of_date"),
        "filters_applied": {
            "markets": filters.get("markets", []),
            "category": filters.get("category", "All"),
            "boutique_tier": filters.get("tier", "All")
        },
        "regional_summary": {
            "boutiques_on_target": k["on_target"],
            "boutiques_total": k["total_boutiques"],
            "achievement_pct": k["pct_on_target"],
            "critical_gaps": k["critical_gaps"],
            "over_stock_positions": k["overstock_positions"],
            "capital_at_risk_usd": k["capital_at_risk"]
        },
        "category_summary": cat_summary,
        "top_critical_gaps": [{
            "sku": r["reference_sku"],
            "name": r["reference_name"],
            "boutique": r["boutique_name"],
            "market": r["market"],
            "gap": int(r["gap"]),
            "gap_value_usd": float(r["gap_value"]),
            "weeks_to_stockout": float(r["weeks_stockout"]) if r["weeks_stockout"] < 999 else 99.0,
            "urgency": r["urgency"],
            "inbound_units": int(r["inbound_units"])
        } for r in gaps],
        "top_over_stock": [{
            "sku": r["reference_sku"],
            "boutique": r["boutique_name"],
            "excess_units": int(abs(r["gap"])),
            "excess_value_usd": float(abs(r["gap_value"])),
            "weeks_cover": float(r["weeks_stockout"]) if r["weeks_stockout"] < 999 else 99.0
        } for r in over],
        "boutique_tier_summary": {
            "Flagship Maison": {"achievement_pct": 82.0},
            "Flagship": {"achievement_pct": 71.0},
            "Standard": {"achievement_pct": 58.0},
            "Emerging": {"achievement_pct": 43.0}
        }
    }
    
    # Build prompt messages dynamically
    from utils.vector_store import search_vector_store
    queries = [
        "supply chain allocation policy APAC",
        "emergency stock request procedure boutique",
        "model stock inventory management luxury"
    ]
    rag_chunks = []
    seen = set()
    for q in queries:
        for res in search_vector_store(q, k=2):
            if res["id"] not in seen:
                seen.add(res["id"])
                rag_chunks.append(res)
                
    context = "\n\n".join(f"Doc ID: {c['id']} | Title: {c['title']}\n{c['content']}" for c in rag_chunks)
    
    from generate.generate_model_stock import generate_model_stock_brief
    # We can just construct system/user messages to stream them
    system_prompt = (
        "You are the VP of Supply Chain for Aurelle APAC, presenting the weekly model stock review "
        "to the regional planning team and Market Directors. Your output must be precise, "
        "commercially grounded, and action-oriented. You speak in sophisticated business terms. "
        "Cite policy documents and ID numbers when recommending actions.\n\n"
        "CRITICAL RULES:\n"
        "- Minimum 500 words. Maximum 800 words.\n"
        "- Never recommend discounting to clear over-stock.\n"
        "- Always recommend reallocation from over-stocked boutiques before making new stock requests.\n"
        "- Emergency stock requests must explicitly reference the DOC-004 protocol.\n"
        "- Cite document ID numbers (e.g., DOC-004) when referring to policy guidelines."
    )
    user_prompt = f"RAG Policy Context:\n{context}\n\nWeekly Target Gaps Summary:\n{json.dumps(ai_dict, indent=2)}"
    
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

# ── 2. Planning & Forecast Service ──
def forecast_filters() -> dict:
    targets = _targets_df()
    return {
        "markets": ["All APAC"] + sorted(targets["market"].dropna().unique().tolist()),
        "categories": ["Watches", "Fine Jewellery", "High Jewellery"],
        "collections": sorted(targets["collection"].dropna().unique().tolist()),
        "skus": sorted(targets["reference_sku"].dropna().unique().tolist()),
        "horizons": [30, 60, 90]
    }

def forecast_overview(filters: dict) -> dict:
    market = filters.get("market", "All APAC")
    category = filters.get("category", "Watches")
    collections = filters.get("collections", [])
    skus = filters.get("skus", [])
    horizon = filters.get("horizon", 90)
    seasonality = filters.get("seasonality", True)
    include_inbound_flag = filters.get("include_inbound", True)

    df_sales = _sales_df()
    df_supply = _df()
    df_inbound = _inbound_df()
    df_enriched = get_enriched_model_stock(df_supply["date"].max())

    parent_products = [SKU_TO_PRODUCT[sku] for sku in skus if sku in SKU_TO_PRODUCT]
    latest_date_in_sales = datetime.strptime(df_sales["date"].max(), "%Y-%m-%d").date()
    forecast_start_date = latest_date_in_sales + timedelta(days=1)
    forecast_dates = [forecast_start_date + timedelta(days=i) for i in range(horizon)]

    # Calculate daily forecast demand
    if market == "All APAC":
        markets_list = [m for m in df_supply["market"].unique() if m != "All"]
        daily_forecast = np.zeros(horizon)
        current_stock = 0
        
        for mkt in markets_list:
            df_sales_mkt = df_sales[(df_sales["market"] == mkt) & (df_sales["product"].isin(parent_products))]
            mkt_velocity = calculate_base_velocity(df_sales_mkt, weeks=12)
            mkt_daily = apply_seasonality(mkt_velocity, mkt, forecast_dates, seasonality)
            daily_forecast += np.array(mkt_daily)
            
            df_enriched_mkt = df_enriched[(df_enriched["market"] == mkt) & (df_enriched["reference_sku"].isin(skus))]
            current_stock += df_enriched_mkt["stock_available"].sum()
            
        daily_forecast = daily_forecast.tolist()
    else:
        df_sales_mkt = df_sales[(df_sales["market"] == market) & (df_sales["product"].isin(parent_products))]
        base_velocity = calculate_base_velocity(df_sales_mkt, weeks=12)
        daily_forecast = apply_seasonality(base_velocity, market, forecast_dates, seasonality)
        
        df_enriched_mkt = df_enriched[(df_enriched["market"] == market) & (df_enriched["reference_sku"].isin(skus))]
        current_stock = df_enriched_mkt["stock_available"].sum()

    # Inbound shipments
    if market == "All APAC":
        df_inbound_filtered = df_inbound[df_inbound["reference_sku"].isin(skus)]
    else:
        df_inbound_filtered = df_inbound[(df_inbound["reference_sku"].isin(skus)) & (df_inbound["market"] == market)]

    # Get average unit cost
    sku_costs = _targets_df()[_targets_df()["reference_sku"].isin(skus)]["unit_cost_usd"]
    avg_unit_cost = sku_costs.mean() if not sku_costs.empty else 0.0

    timeline = calculate_supply_timeline(
        current_stock, daily_forecast, df_inbound_filtered, forecast_start_date, include_inbound_flag, avg_unit_cost
    )

    # Cumulative calculations for Chart
    cum_forecast = np.cumsum(daily_forecast).tolist()
    
    inbound_dates_list = []
    inbound_units_list = []
    if include_inbound_flag and not df_inbound_filtered.empty:
        df_valid = df_inbound_filtered[df_inbound_filtered["shipment_status"] != "Delayed"]
        for _, row in df_valid.iterrows():
            eta_str = row["estimated_arrival"]
            eta_d = datetime.strptime(eta_str, "%Y-%m-%d").date()
            inbound_dates_list.append(eta_d)
            inbound_units_list.append(int(row["units_ordered"]))

    cum_inbound_units = []
    current_cum = 0
    inbound_map = {}
    for d_item, u in zip(inbound_dates_list, inbound_units_list):
        inbound_map[d_item] = inbound_map.get(d_item, 0) + u
        
    for idx in range(horizon):
        cur_date = forecast_start_date + timedelta(days=idx)
        if cur_date in inbound_map:
            current_cum += inbound_map[cur_date]
        cum_inbound_units.append(current_cum)

    # Market breakdowns (Section C)
    market_stats = []
    if market == "All APAC":
        markets_list = [m for m in df_supply["market"].unique() if m != "All"]
        for mkt in markets_list:
            df_sales_m = df_sales[(df_sales["market"] == mkt) & (df_sales["product"].isin(parent_products))]
            vel_m = calculate_base_velocity(df_sales_m, weeks=12)
            if vel_m == 0.0:
                continue
            daily_m = apply_seasonality(vel_m, mkt, forecast_dates, seasonality)
            stock_m = df_enriched[(df_enriched["market"] == mkt) & (df_enriched["reference_sku"].isin(skus))]["stock_available"].sum()
            inb_m = df_inbound_filtered[df_inbound_filtered["market"] == mkt]
            timeline_m = calculate_supply_timeline(
                stock_m, daily_m, inb_m, forecast_start_date, include_inbound_flag, avg_unit_cost
            )
            
            market_stats.append({
                "market": mkt,
                "stock": int(stock_m),
                "demand": int(sum(daily_m)),
                "inbound": int(timeline_m["confirmed_inbound_units"]),
                "gap": int(timeline_m["supply_gap_units"]),
                "risk": timeline_m["risk_level"],
                "stockout_date": timeline_m["stockout_date"].strftime("%Y-%m-%d") if timeline_m["stockout_date"] else "No Risk"
            })

    # Inbound Pipeline Timelines (Section D)
    pipeline_rows = []
    if not df_inbound_filtered.empty:
        df_pipe = df_inbound_filtered.sort_values("estimated_arrival").head(25)
        for _, row in df_pipe.iterrows():
            pipeline_rows.append({
                "shipment_id": row["shipment_id"],
                "origin": row["origin"],
                "destination": _short(row["destination_boutique"]),
                "sku": row["reference_sku"],
                "units": int(row["units_ordered"]),
                "ship_date": row["ship_date"],
                "eta": row["estimated_arrival"],
                "status": row["shipment_status"] if int(row["delay_days"]) <= 3 else f"Delayed (+{int(row['delay_days'])}d: {row['delay_reason']})",
                "vic": "YES" if row["priority_flag"] and row["linked_vic_client"] else "No",
                "priority": bool(row["priority_flag"])
            })

    return {
        "kpis": {
            "forecast_demand": round(total_demand := sum(daily_forecast), 1),
            "available_supply": int(current_stock + timeline["confirmed_inbound_units"]),
            "gap": round(timeline["supply_gap_units"], 1),
            "gap_usd": round(timeline["supply_gap_usd"], 2),
            "stockout_date": timeline["stockout_date"].strftime("%Y-%m-%d") if timeline["stockout_date"] else None,
            "risk_level": timeline["risk_level"]
        },
        "chart": {
            "dates": [d.strftime("%Y-%m-%d") for d in forecast_dates],
            "forecast": cum_forecast,
            "stock": timeline["stock_levels"][:-1],
            "inbound": cum_inbound_units
        },
        "market_stats": market_stats,
        "pipeline": pipeline_rows
    }

def forecast_scenario(r: dict) -> dict:
    from_m = r.get("from_market")
    to_m = r.get("to_market")
    units = int(r.get("units", 1))
    lead_days = int(r.get("lead_days", 3))
    selected_skus = r.get("skus", [])
    horizon = int(r.get("horizon", 90))
    seasonality = r.get("seasonality", True)

    df_sales = _sales_df()
    df_supply = _df()
    df_enriched = get_enriched_model_stock(df_supply["date"].max())
    
    parent_products = [SKU_TO_PRODUCT[sku] for sku in selected_skus if sku in SKU_TO_PRODUCT]
    latest_date_in_sales = datetime.strptime(df_sales["date"].max(), "%Y-%m-%d").date()
    forecast_start_date = latest_date_in_sales + timedelta(days=1)
    forecast_dates = [forecast_start_date + timedelta(days=i) for i in range(horizon)]

    # Fetch from market stats
    df_sales_from = df_sales[(df_sales["market"] == from_m) & (df_sales["product"].isin(parent_products))]
    vel_from = calculate_base_velocity(df_sales_from, weeks=12)
    daily_from = apply_seasonality(vel_from, from_m, forecast_dates, seasonality)
    stock_from = df_enriched[(df_enriched["market"] == from_m) & (df_enriched["reference_sku"].isin(selected_skus))]["stock_available"].sum()
    inbound_from = _inbound_df()[(_inbound_df()["reference_sku"].isin(selected_skus)) & (_inbound_df()["market"] == from_m)]

    # Fetch to market stats
    df_sales_to = df_sales[(df_sales["market"] == to_m) & (df_sales["product"].isin(parent_products))]
    vel_to = calculate_base_velocity(df_sales_to, weeks=12)
    daily_to = apply_seasonality(vel_to, to_m, forecast_dates, seasonality)
    stock_to = df_enriched[(df_enriched["market"] == to_m) & (df_enriched["reference_sku"].isin(selected_skus))]["stock_available"].sum()
    inbound_to = _inbound_df()[(_inbound_df()["reference_sku"].isin(selected_skus)) & (_inbound_df()["market"] == to_m)]

    sku_costs = _targets_df()[_targets_df()["reference_sku"].isin(selected_skus)]["unit_cost_usd"]
    avg_unit_cost = sku_costs.mean() if not sku_costs.empty else 0.0

    sim = run_reallocation_scenario(
        int(stock_from), int(stock_to), daily_from, daily_to, units, lead_days,
        inbound_from, inbound_to, forecast_start_date, True, avg_unit_cost
    )
    
    # Format simulation results for JSON output
    def format_tline(tline):
        return {
            "stock_levels": tline["stock_levels"],
            "stockout_date": tline["stockout_date"].strftime("%Y-%m-%d") if tline["stockout_date"] else None,
            "supply_gap_units": tline["supply_gap_units"],
            "supply_gap_usd": tline["supply_gap_usd"],
            "risk_level": tline["risk_level"]
        }
        
    return {
        "from_market": {
            "before": format_tline(sim["from_market"]["before"]),
            "after": format_tline(sim["from_market"]["after"]),
            "verdict": sim["from_market"]["verdict"]
        },
        "to_market": {
            "before": format_tline(sim["to_market"]["before"]),
            "after": format_tline(sim["to_market"]["after"]),
            "verdict": sim["to_market"]["verdict"]
        },
        "overall_verdict": sim["overall_verdict"],
        "recommendation": sim["recommendation"]
    }

def forecast_report_messages(filters: dict) -> list:
    overview_data = forecast_overview(filters)
    k = overview_data["kpis"]
    
    # Fetch RAG context
    from utils.vector_store import search_vector_store
    queries = [
        "demand forecasting supply planning APAC",
        "replenishment lead time Switzerland Singapore",
        "emergency stock request VIC sales closure"
    ]
    rag_chunks = []
    seen = set()
    for q in queries:
        for res in search_vector_store(q, k=2):
            if res["id"] not in seen:
                seen.add(res["id"])
                rag_chunks.append(res)
                
    context = "\n\n".join(f"Doc ID: {c['id']} | Title: {c['title']}\n{c['content']}" for c in rag_chunks)
    
    system_prompt = (
        "You are the APAC Demand Planning Director for Aurelle, presenting a forward supply plan "
        "to the Regional VP of Supply Chain and Market Directors. Your output is analytical, "
        "forward-looking, and specific. You flag risks early. You recommend actions before problems "
        "become crises. You quantify everything in units and USD.\n\n"
        "CRITICAL RULES:\n"
        "- Minimum 600 words. Maximum 900 words.\n"
        "- Always distinguish between confirmed supply and at-risk supply.\n"
        "- Never recommend emergency requests without citing DOC-004.\n"
        "- If the gap can be resolved by reallocation, recommend this first before new requests.\n"
        "- Be specific about lead times."
    )
    user_prompt = f"RAG Policy Context:\n{context}\n\nForward Supply Forecasting Data:\n{json.dumps(overview_data, indent=2)}"
    
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
