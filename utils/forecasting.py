import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta

# --- Seasonality Multipliers Table ---
MARKET_SEASONALITY = {
    "China": {
        1: 1.6,   # CNY — January
        2: 1.4,   # CNY tail
        10: 1.2,  # Golden Week China
        11: 1.3,  # Singles Day effect
        12: 1.4   # Christmas / year end
    },
    "Japan": {
        3: 1.2,   # Fiscal year end gifting
        4: 1.35,  # Golden Week starts
        5: 1.35,  # Golden Week
        12: 1.3   # Christmas / year end
    },
    "South Korea": {
        1: 1.2,   # Lunar New Year
        9: 1.25,  # Chuseok
        12: 1.4   # Christmas
    },
    "Singapore": {
        1: 1.3,   # CNY
        2: 1.2,
        12: 1.3
    },
    "Hong Kong": {
        1: 1.4,   # CNY
        2: 1.3,
        12: 1.3
    },
    "Australia": {
        12: 1.4,  # Christmas
        1: 1.2    # Summer holidays
    },
    "India": {
        10: 1.5,  # Diwali
        11: 1.3,  # Diwali tail + wedding season
        2: 1.2    # Valentine's Day
    },
    "Taiwan": {
        1: 1.3,
        2: 1.2,
        12: 1.3
    },
    "default": {}
}

def calculate_base_velocity(sales_df: pd.DataFrame, weeks: int = 12) -> float:
    """
    Calculate exponentially weighted weekly sales velocity.
    Recent weeks are weighted more heavily.
    """
    if sales_df.empty:
        return 0.0
    
    df = sales_df.copy()
    df['date'] = pd.to_datetime(df['date'])
    
    latest_date = df['date'].max()
    start_date = latest_date - pd.Timedelta(weeks=weeks)
    
    # Filter to lookback window
    lookback_df = df[(df['date'] >= start_date) & (df['date'] <= latest_date)]
    if lookback_df.empty:
        return 0.0
        
    # Aggregate units sold to weekly sums
    lookback_df = lookback_df.set_index('date')
    weekly_series = lookback_df['units_sold'].resample('W').sum().tail(weeks)
    
    n = len(weekly_series)
    if n == 0:
        return 0.0
        
    # Apply exponential weighting: weights = [0.5^(n-i) for i in range(1, n+1)]
    # i = 1 (oldest week) gets 0.5^(n-1)
    # i = n (newest week) gets 0.5^0 = 1.0
    weights = [0.5**(n - i) for i in range(1, n + 1)]
    
    # Normalize weights to sum to 1
    total_weight = sum(weights)
    if total_weight == 0:
        return 0.0
        
    normalized_weights = [w / total_weight for w in weights]
    
    weighted_velocity = sum(val * w for val, w in zip(weekly_series, normalized_weights))
    
    return float(weighted_velocity)

def apply_seasonality(base_velocity: float, market: str, forecast_dates: list, apply_season_flag: bool) -> list:
    """
    Apply market-specific monthly multipliers to the base velocity.
    Returns list of daily forecast units.
    """
    daily_forecasts = []
    
    # Clean market name for matching
    cleaned_market = market.strip()
    if cleaned_market == "Korea":
        cleaned_market = "South Korea"
        
    multipliers = MARKET_SEASONALITY.get(cleaned_market, MARKET_SEASONALITY.get("default", {}))
    
    for f_date in forecast_dates:
        # Handle datetime vs date objects
        if isinstance(f_date, str):
            dt = datetime.strptime(f_date, "%Y-%m-%d").date()
        elif isinstance(f_date, datetime):
            dt = f_date.date()
        else:
            dt = f_date
            
        month = dt.month
        multiplier = multipliers.get(month, 1.0) if apply_season_flag else 1.0
        
        # daily_forecast = (base_velocity / 7) * multiplier
        daily_val = (base_velocity / 7.0) * multiplier
        daily_forecasts.append(daily_val)
        
    return daily_forecasts

def calculate_supply_timeline(
    current_stock: int,
    daily_forecast: list,
    inbound_df: pd.DataFrame,
    forecast_start_date: date,
    include_inbound: bool,
    unit_cost_usd: float = 0.0
) -> dict:
    """
    Project daily stock levels, calculate stockout date, and compute supply gaps.
    """
    stock_levels = [float(current_stock)]
    horizon_days = len(daily_forecast)
    stockout_idx = None
    
    # Process inbound shipments
    inbound_by_date = {}
    confirmed_inbound_units = 0
    
    if include_inbound and not inbound_df.empty:
        # Filter out delayed shipments
        valid_inbound = inbound_df[inbound_df['shipment_status'] != 'Delayed']
        for _, row in valid_inbound.iterrows():
            eta_val = row['estimated_arrival']
            if isinstance(eta_val, str):
                eta_dt = datetime.strptime(eta_val, "%Y-%m-%d").date()
            elif isinstance(eta_dt, datetime):
                eta_dt = eta_val.date()
            else:
                eta_dt = eta_val
                
            units = int(row['units_ordered'])
            inbound_by_date[eta_dt] = inbound_by_date.get(eta_dt, 0) + units
            confirmed_inbound_units += units

    current_temp_stock = float(current_stock)
    
    for idx in range(horizon_days):
        cur_date = forecast_start_date + timedelta(days=idx)
        
        # Add inbound arrivals scheduled for this day
        if cur_date in inbound_by_date:
            current_temp_stock += inbound_by_date[cur_date]
            
        # Subtract forecast demand
        current_temp_stock -= daily_forecast[idx]
        
        # Clip to 0
        if current_temp_stock < 0:
            current_temp_stock = 0.0
            
        stock_levels.append(current_temp_stock)
        
        if current_temp_stock <= 0.0 and stockout_idx is None:
            stockout_idx = idx

    # Calculate stockout date
    stockout_date = None
    if stockout_idx is not None:
        stockout_date = forecast_start_date + timedelta(days=stockout_idx)
        days_to_stockout = stockout_idx
    else:
        days_to_stockout = 999
        
    # Risk Level mapping
    if stockout_date is not None:
        if days_to_stockout <= 14:
            risk_level = "CRITICAL"
        elif days_to_stockout <= 30:
            risk_level = "HIGH"
        elif days_to_stockout <= 60:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
    else:
        risk_level = "LOW"
        
    # Supply Gap
    total_demand = sum(daily_forecast)
    total_available = current_stock + (confirmed_inbound_units if include_inbound else 0)
    gap = total_demand - total_available
    gap_units = max(0.0, gap)
    gap_usd = gap_units * unit_cost_usd
    
    return {
        "stock_levels": stock_levels,
        "stockout_date": stockout_date,
        "supply_gap_units": round(gap_units, 1),
        "supply_gap_usd": round(gap_usd, 2),
        "risk_level": risk_level,
        "confirmed_inbound_units": confirmed_inbound_units
    }

def run_reallocation_scenario(
    from_market_stock: int,
    to_market_stock: int,
    from_market_daily_forecast: list,
    to_market_daily_forecast: list,
    transfer_units: int,
    transfer_lead_days: int,
    from_inbound: pd.DataFrame,
    to_inbound: pd.DataFrame,
    forecast_start_date: date,
    include_inbound: bool = True,
    unit_cost_usd: float = 0.0
) -> dict:
    """
    Evaluate the impact of moving X units from from_market to to_market.
    """
    # 1. Before Scenario
    timeline_from_before = calculate_supply_timeline(
        from_market_stock, from_market_daily_forecast, from_inbound, forecast_start_date, include_inbound, unit_cost_usd
    )
    timeline_to_before = calculate_supply_timeline(
        to_market_stock, to_market_daily_forecast, to_inbound, forecast_start_date, include_inbound, unit_cost_usd
    )
    
    # 2. After Scenario
    from_market_stock_after = max(0, from_market_stock - transfer_units)
    
    # Add the transfer arrival as a temporary inbound shipment to the 'to' market
    to_inbound_after = to_inbound.copy() if not to_inbound.empty else pd.DataFrame(columns=["shipment_id", "units_ordered", "estimated_arrival", "shipment_status"])
    arrival_date = (forecast_start_date + timedelta(days=transfer_lead_days)).strftime("%Y-%m-%d")
    
    new_shipment = pd.DataFrame([{
        "shipment_id": "TRF-SCENARIO-01",
        "units_ordered": transfer_units,
        "estimated_arrival": arrival_date,
        "shipment_status": "In Transit"
    }])
    to_inbound_after = pd.concat([to_inbound_after, new_shipment], ignore_index=True)
    
    timeline_from_after = calculate_supply_timeline(
        from_market_stock_after, from_market_daily_forecast, from_inbound, forecast_start_date, include_inbound, unit_cost_usd
    )
    timeline_to_after = calculate_supply_timeline(
        to_market_stock, to_market_daily_forecast, to_inbound_after, forecast_start_date, include_inbound, unit_cost_usd
    )
    
    # 3. Formulate Verdicts
    # To Market Verdict
    before_gap = timeline_to_before["supply_gap_units"]
    after_gap = timeline_to_after["supply_gap_units"]
    
    if after_gap == 0:
        verdict_to = "✓ Reallocation resolves the supply gap."
    elif after_gap < before_gap:
        verdict_to = f"⚠ Reallocation reduces gap from {before_gap} to {after_gap} units."
    else:
        verdict_to = "No impact on gap."
        
    # From Market Verdict
    from_before_risk = timeline_from_before["risk_level"]
    from_after_risk = timeline_from_after["risk_level"]
    
    if from_after_risk in ["CRITICAL", "HIGH"] and from_before_risk not in ["CRITICAL", "HIGH"]:
        verdict_from = f"⚠ Warning: Reallocation increases risk in source market to {from_after_risk}."
        overall_verdict = "HIGH RISK"
        recommendation = f"⚠ Warning: transferring {transfer_units} units creates a new supply risk in the source market. Reduce transfer quantity."
    else:
        verdict_from = "Source market remains stable."
        if after_gap == 0:
            overall_verdict = "RESOLVED"
            recommendation = "✓ This reallocation resolves the supply gap. Recommend filing inter-boutique transfer request."
        else:
            overall_verdict = "PARTIAL"
            recommendation = "⚠ This reallocation reduces but does not resolve the gap. Additional replenishment required."
            
    return {
        "from_market": {
            "before": timeline_from_before,
            "after": timeline_from_after,
            "verdict": verdict_from
        },
        "to_market": {
            "before": timeline_to_before,
            "after": timeline_to_after,
            "verdict": verdict_to
        },
        "overall_verdict": overall_verdict,
        "recommendation": recommendation
    }
