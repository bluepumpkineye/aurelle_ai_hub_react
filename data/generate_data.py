import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import pandas as pd
import numpy as np
import json
import os
from datetime import datetime, timedelta
import random

random.seed(42)
np.random.seed(42)

# ── Configuration ──────────────────────────────────────────────
MARKETS = ["China", "Japan", "South Korea", "Australia", 
           "Singapore", "Hong Kong", "Thailand", "India", "Taiwan", "Macau"]

CHANNELS = ["Boutique", "E-Commerce", "Wholesale", 
            "Travel Retail", "Private Client"]

CATEGORIES = ["High Jewellery", "Watches", "Fine Jewellery", 
              "Accessories", "Fragrances"]

PRODUCTS = {
    "High Jewellery":  ["Maison Panthère Necklace", "Trinity HJ Cuff", "Cactus de Aurelle Collier", "LOVE Bracelet HJ"],
    "Watches":         ["Santos de Aurelle", "Tank Must", "Ballon Bleu de Aurelle", "Panthère de Aurelle Watch", "Baignoire Watch"],
    "Fine Jewellery":  ["LOVE Bracelet Classic", "Juste un Clou Bracelet", "Clash de Aurelle Ring", "Trinity Ring Classic", "Aurelle d'Amour Necklace"],
    "Accessories":     ["Double C de Aurelle Bag", "Panthère Chain Bag", "Aurelle Trinity Wallet", "Santos Eyewear"],
    "Fragrances":      ["La Panthère Parfum", "Baiser Volé", "Declaration", "Aurelle Carat"]
}

SEGMENTS = ["VIP (>$50K)", "Premium ($10K-$50K)", 
            "Aspirational ($1K-$10K)", "Entry (<$1K)"]

BOUTIQUES = [
    {"id": "hk-1", "name": "Aurelle Landmark Prince's Hong Kong", "market": "Hong Kong", "tier": "Flagship", "lat": 22.2812, "lng": 114.1574, "sa_count": 18, "annual_revenue": 68.2},
    {"id": "hk-2", "name": "Aurelle Peninsula Hong Kong", "market": "Hong Kong", "tier": "Major", "lat": 22.2951, "lng": 114.1722, "sa_count": 12, "annual_revenue": 39.5},
    {"id": "cn-1", "name": "Aurelle Plaza 66 Shanghai", "market": "China", "tier": "Flagship", "lat": 31.2286, "lng": 121.4559, "sa_count": 22, "annual_revenue": 84.1},
    {"id": "cn-2", "name": "Aurelle Kerry Centre Shanghai", "market": "China", "tier": "Major", "lat": 31.2262, "lng": 121.4487, "sa_count": 14, "annual_revenue": 45.8},
    {"id": "cn-3", "name": "Aurelle SKP Beijing", "market": "China", "tier": "Flagship", "lat": 39.9147, "lng": 116.4535, "sa_count": 20, "annual_revenue": 72.5},
    {"id": "cn-4", "name": "Aurelle Taikoo Li Chengdu", "market": "China", "tier": "Major", "lat": 30.6571, "lng": 104.0836, "sa_count": 12, "annual_revenue": 32.4},
    {"id": "cn-5", "name": "Aurelle MixC Shenzhen", "market": "China", "tier": "Major", "lat": 22.5365, "lng": 114.0545, "sa_count": 10, "annual_revenue": 28.1},
    {"id": "jp-1", "name": "Aurelle Mansion Tokyo Ginza", "market": "Japan", "tier": "Flagship", "lat": 35.6717, "lng": 139.7647, "sa_count": 25, "annual_revenue": 78.4},
    {"id": "jp-2", "name": "Aurelle Omotesando Tokyo", "market": "Japan", "tier": "Major", "lat": 35.6692, "lng": 139.7107, "sa_count": 15, "annual_revenue": 36.1},
    {"id": "jp-3", "name": "Aurelle Shinsaibashi Osaka", "market": "Japan", "tier": "Major", "lat": 34.6723, "lng": 135.5022, "sa_count": 14, "annual_revenue": 31.2},
    {"id": "kr-1", "name": "Aurelle Cheongdam Maison Seoul", "market": "South Korea", "tier": "Flagship", "lat": 37.5252, "lng": 127.0427, "sa_count": 16, "annual_revenue": 48.6},
    {"id": "kr-2", "name": "Aurelle Lotte Main Seoul", "market": "South Korea", "tier": "Major", "lat": 37.5651, "lng": 126.9810, "sa_count": 12, "annual_revenue": 29.8},
    {"id": "sg-1", "name": "Aurelle ION Orchard Singapore", "market": "Singapore", "tier": "Major", "lat": 1.3040, "lng": 103.8318, "sa_count": 14, "annual_revenue": 34.2},
    {"id": "au-1", "name": "Aurelle Castlereagh St Sydney", "market": "Australia", "tier": "Major", "lat": -33.8696, "lng": 151.2098, "sa_count": 12, "annual_revenue": 26.5},
    {"id": "au-2", "name": "Aurelle Collins St Melbourne", "market": "Australia", "tier": "Standard", "lat": -37.8136, "lng": 144.9701, "sa_count": 10, "annual_revenue": 18.2},
    {"id": "tw-1", "name": "Aurelle Taipei 101 Mall", "market": "Taiwan", "tier": "Major", "lat": 25.0336, "lng": 121.5648, "sa_count": 12, "annual_revenue": 28.7},
    {"id": "mo-1", "name": "Aurelle Wynn Palace Macau", "market": "Macau", "tier": "Major", "lat": 22.1485, "lng": 113.5678, "sa_count": 10, "annual_revenue": 31.9},
    {"id": "th-1", "name": "Aurelle Siam Paragon Bangkok", "market": "Thailand", "tier": "Major", "lat": 13.7461, "lng": 100.5350, "sa_count": 8, "annual_revenue": 21.4},
    {"id": "in-1", "name": "Aurelle DLF Chanakya Delhi", "market": "India", "tier": "Standard", "lat": 28.5910, "lng": 77.1895, "sa_count": 6, "annual_revenue": 14.8}
]

# Generate Sales Associates
SAS = []
first_names = ["Yuki", "Mei", "Ji-woo", "Priyan", "Li", "Hiroto", "Min-su", "Sanjay", "Somchai", "Chen", "Kenji", "Eun-ji", "Ananya", "Thanakorn", "Wei"]
last_names  = ["Tanaka", "Wong", "Kim", "Sharma", "Liu", "Suzuki", "Park", "Patel", "Prasert", "Zhang", "Nakamura", "Lee", "Gupta", "Chaichana", "Chen"]

for bt in BOUTIQUES:
    for idx in range(bt["sa_count"]):
        SAS.append({
            "sa_id": f"SA-{bt['id'].upper()}-{idx+1:02d}",
            "name": f"{random.choice(first_names)} {random.choice(last_names)}",
            "boutique_id": bt["id"],
            "boutique_name": bt["name"],
            "market": bt["market"],
            "tenure_years": random.choice([1, 2, 3, 4, 5, 6, 7, 8, 10]),
            "clients_count": random.randint(30, 280),
            "retention_rate": round(random.uniform(72.0, 96.0), 1)
        })

# ── Helper for Client Notes ────────────────────────────────────
def generate_client_note(segment, market):
    notes = {
        "VIP (>$50K)": [
            "Prefers private viewings for High Jewellery launches. Interested in bespoke commissions.",
            "Attends all VIP trunk shows. Has strong interest in limited edition Panthère pieces.",
            "Long-standing relationship since 2015. Anniversary purchases in June annually.",
            "Highly interested in vintage Aurelle watch restorations. Prefers Maison Mansion viewings."
        ],
        "Premium ($10K-$50K)": [
            "Growing client - escalated from Aspirational in 2023. Watch collector.",
            "Referred two new clients in Q1 2024. Interested in Santos family.",
            "Prefers e-commerce with in-boutique final fitting.",
            "Interested in gold LOVE and Clash ring stackables."
        ],
        "Aspirational ($1K-$10K)": [
            "First-time buyer via digital campaign. Gifting motivation.",
            "Regular fragrance buyer upgrading to fine jewellery.",
            "Celebrated career milestone with Trinity Ring purchase."
        ],
        "Entry (<$1K)": [
            "Fragrance and accessories. Strong digital engagement.",
            "Tourist buyer. Purchased fragrance gift set.",
            "Interested in cardholders and small leather goods."
        ]
    }
    return random.choice(notes.get(segment, ["Regular client."]))

# ── 1. CRM / Client Data ───────────────────────────────────────
CRM_PROFILES = []

def generate_crm_data():
    global CRM_PROFILES
    clients = []
    
    # 2500 clients
    for i in range(2500):
        boutique = random.choice(BOUTIQUES)
        segment = random.choices(SEGMENTS, weights=[0.08, 0.22, 0.45, 0.25], k=1)[0]
        
        clv_ranges = {
            "VIP (>$50K)":           (50000, 850000),
            "Premium ($10K-$50K)":   (10000, 50000),
            "Aspirational ($1K-$10K)":(1000, 10000),
            "Entry (<$1K)":          (200,   1000)
        }
        clv          = random.uniform(*clv_ranges[segment])
        join_date    = datetime(2018, 1, 1) + timedelta(days=random.randint(0, 2500))
        last_purchase= join_date + timedelta(days=random.randint(30, 900))
        if last_purchase > datetime.now():
            last_purchase = datetime.now() - timedelta(days=random.randint(1, 150))
            
        client_id = f"CRT-{boutique['market'][:2].upper()}-{i+1000:04d}"
        
        # Stylists for VIPs
        stylist = "None"
        if segment == "VIP (>$50K)":
            bt_sas = [sa for sa in SAS if sa["boutique_id"] == boutique["id"]]
            if bt_sas:
                stylist = random.choice(bt_sas)["name"]
        
        clients.append({
            "client_id":       client_id,
            "name":            f"{random.choice(first_names)} {random.choice(last_names)}",
            "market":          boutique["market"],
            "boutique_id":     boutique["id"],
            "boutique_name":   boutique["name"],
            "segment":         segment,
            "preferred_channel": random.choice(CHANNELS),
            "preferred_category": random.choice(CATEGORIES),
            "lifetime_value_usd": round(clv, 2),
            "total_transactions":  random.randint(1, 15) if segment != "VIP (>$50K)" else random.randint(8, 48),
            "avg_order_value":     0, # Calculated below
            "join_date":           join_date.strftime("%Y-%m-%d"),
            "last_purchase_date":  last_purchase.strftime("%Y-%m-%d"),
            "days_since_purchase": (datetime.now() - last_purchase).days,
            "churn_risk":          "Low" if (datetime.now() - last_purchase).days < 120 else "Medium" if (datetime.now() - last_purchase).days < 270 else "High",
            "satisfaction_score":  round(random.uniform(7.0, 10.0), 1),
            "boutique_visits_ytd": random.randint(0, 5) if segment == "Entry (<$1K)" else random.randint(3, 20),
            "digital_engagement":  random.choice(["High", "Medium", "Low"]),
            "owns_watch":          random.random() > (0.2 if segment == "VIP (>$50K)" else 0.6),
            "owns_jewellery":      random.random() > (0.1 if segment == "VIP (>$50K)" else 0.5),
            "vip_events_attended": random.randint(0, 10) if segment == "VIP (>$50K)" else random.randint(0, 2),
            "personal_stylist":    stylist,
            "notes":               generate_client_note(segment, boutique["market"]),
        })
    
    df = pd.DataFrame(clients)
    df["avg_order_value"] = round(df["lifetime_value_usd"] / df["total_transactions"], 2)
    
    CRM_PROFILES = df.to_dict('records')
    df.to_csv("data/crm_data.csv", index=False)
    print(f"CRM data: {len(df)} clients generated")
    return df

# ── 2. Sales Data (Scaled to 20,000+ Transactions) ──────────────
def generate_sales_data():
    records = []
    start_date = datetime(2023, 1, 1)
    end_date = datetime(2025, 12, 31)
    delta_days = (end_date - start_date).days
    
    # Pre-select matching SAs for boutiques
    bt_sa_map = {}
    for bt in BOUTIQUES:
        bt_sa_map[bt["id"]] = [sa for sa in SAS if sa["boutique_id"] == bt["id"]]
    
    # Pre-select clients by boutique
    bt_client_map = {}
    for bt in BOUTIQUES:
        bt_client_map[bt["id"]] = [c for c in CRM_PROFILES if c["boutique_id"] == bt["id"]]
        
    for i in range(22000):  # 22,000 transactions
        date = start_date + timedelta(days=random.randint(0, delta_days))
        boutique = random.choice(BOUTIQUES)
        channel = random.choices(CHANNELS, weights=[0.60, 0.15, 0.10, 0.05, 0.10], k=1)[0]
        
        category = random.choices(CATEGORIES, weights=[0.10, 0.30, 0.40, 0.12, 0.08], k=1)[0]
        product = random.choice(PRODUCTS[category])
        
        price_ranges = {
            "High Jewellery":  (55000, 950000),
            "Watches":         (4800,  88000),
            "Fine Jewellery":  (1400,  48000),
            "Accessories":     (380,   3800),
            "Fragrances":      (130,   520)
        }
        
        base_price = random.uniform(*price_ranges[category])
        
        # Market multipliers
        market_mult = {
            "China": 1.15, "Japan": 1.08, "South Korea": 1.12,
            "Australia": 0.98, "Singapore": 1.18,
            "Hong Kong": 1.22, "Thailand": 0.92, "India": 0.88,
            "Taiwan": 1.10, "Macau": 1.16
        }
        
        market = boutique["market"]
        revenue = base_price * market_mult[market] * random.uniform(0.92, 1.08)
        units   = random.choices([1, 2, 3], weights=[0.90, 0.08, 0.02], k=1)[0] if category != "High Jewellery" else 1
        cogs    = revenue * random.uniform(0.24, 0.32) # Standard luxury high gross margin (~70-76%)
        
        # Seasonal uplifts (Harmonized across all datasets)
        month = date.month
        seasonality_map = {
            1: 1.45,  # CNY peak
            2: 1.40,  # CNY peak
            3: 1.00,  # Spring baseline
            4: 0.95,  # Post-CNY lull
            5: 1.10,  # Spring gifting / Mother's day
            6: 0.90,  # Summer transition
            7: 0.75,  # Summer lull
            8: 0.80,  # Summer lull / mid-year
            9: 1.15,  # Autumn/Golden Week prep
            10: 1.25, # Golden Week / National Day
            11: 1.10, # Holiday build-up
            12: 1.35  # Christmas / New Year
        }
        seasonal = seasonality_map.get(month, 1.0)
        
        total_rev = round(revenue * seasonal * units, 2)
        total_cogs = round(cogs * units, 2)
        gp = round(total_rev - total_cogs, 2)
        
        # Assign SA
        sa_choice = random.choice(bt_sa_map[boutique["id"]])
        sa_id = sa_choice["sa_id"]
        sa_name = sa_choice["name"]
        
        # Assign Client
        client_list = bt_client_map[boutique["id"]]
        if client_list and random.random() > 0.3:
            c_choice = random.choice(client_list)
            client_id = c_choice["client_id"]
            client_segment = c_choice["segment"]
            is_repeat = True
        else:
            client_id = f"CRT-WALK-{random.randint(10000, 99999)}"
            client_segment = random.choice(["Aspirational ($1K-$10K)", "Entry (<$1K)"])
            is_repeat = False
            
        records.append({
            "date":           date.strftime("%Y-%m-%d"),
            "year":           date.year,
            "month":          date.month,
            "quarter":        f"Q{(date.month-1)//3+1}",
            "boutique_id":    boutique["id"],
            "boutique_name":  boutique["name"],
            "market":         market,
            "channel":        channel,
            "category":       category,
            "product":        product,
            "units_sold":     units,
            "revenue_usd":    total_rev,
            "cogs_usd":       total_cogs,
            "gross_profit":   gp,
            "gross_margin":   round((gp / total_rev) * 100, 1),
            "segment":        client_segment,
            "is_repeat_client": is_repeat,
            "nps_score":      random.choices([10, 9, 8, 7, 6, 5], weights=[0.55, 0.28, 0.10, 0.04, 0.02, 0.01], k=1)[0],
            "sa_id":          sa_id,
            "sa_name":        sa_name,
            "client_id":      client_id
        })
        
    df = pd.DataFrame(records)
    df.to_csv("data/sales_data.csv", index=False)
    print(f"Sales transactions: {len(df)} records generated")
    
    # Apply actual revenues to Sales Associates
    sa_revenues = df.groupby("sa_id")["revenue_usd"].sum().to_dict()
    for sa in SAS:
        sa["annual_revenue"] = round(sa_revenues.get(sa["sa_id"], random.uniform(800000, 3000000)) / 3, 2) # Divided by 3 years
        
    return df

# ── 3. Marketing Budget Data (ROI Rectified) ────────────────────
def generate_marketing_data():
    records = []
    campaigns = [
        "CNY Collection Campaign", "LOVE & Trinity Icons", "High Jewellery Genesis Launch",
        "Santos de Aurelle Roadshow", "Panthère Aesthetics Tour", "Holiday Gifting Season",
        "Boutique Mansion Renovation", "VIP Client Retreat Venice",
        "Clash de Aurelle Digital Push", "Tank Must Relaunch"
    ]
    media_types = ["Digital", "OOH", "Print", "Events", "PR", "Influencer", "CRM"]
    
    # Generate around 120 campaign-market segments
    for market in MARKETS:
        market_campaigns = random.sample(campaigns, k=random.randint(5, 8))
        for campaign in market_campaigns:
            active_medias = random.sample(media_types, k=random.randint(2, 4))
            for media in active_medias:
                # Realistic luxury budget
                budget = random.uniform(30000, 850000)
                variance_pct = random.uniform(-0.12, 0.18)
                actual_spend = budget * (1 + variance_pct)
                
                # RECTIFIED ROI: Attributed revenue is directly tied to marketing spend
                # Premium brands average an ROI (Return on Ad Spend / Attributed Revenue Ratio) of 150% to 450%
                roi_multiplier = random.uniform(1.6, 4.8) if media in ["CRM", "Events", "Influencer"] else random.uniform(1.2, 3.2)
                revenue_attr = actual_spend * roi_multiplier
                roi_pct = round((revenue_attr - actual_spend) / actual_spend * 100, 1)
                
                # Impressions & Conversions scaled logically
                cpm = random.uniform(8, 45) # Cost Per Mille
                impressions = int((actual_spend / cpm) * 1000)
                
                avg_order_value = random.uniform(1800, 12000)
                conversions = int(revenue_attr / avg_order_value)
                if conversions == 0:
                    conversions = random.randint(1, 5)
                    revenue_attr = conversions * avg_order_value
                    roi_pct = round((revenue_attr - actual_spend) / actual_spend * 100, 1)
                
                records.append({
                    "campaign":          campaign,
                    "market":            market,
                    "media_type":        media,
                    "budget_usd":        round(budget, 2),
                    "actual_usd":        round(actual_spend, 2),
                    "variance_usd":      round(actual_spend - budget, 2),
                    "variance_pct":      round(variance_pct * 100, 1),
                    "impressions":       impressions,
                    "conversions":       conversions,
                    "revenue_attributed":round(revenue_attr, 2),
                    "roi":               roi_pct,
                    "cpm":               round(cpm, 2),
                    "status":            random.choices(["Completed", "Active", "Planned"], weights=[0.70, 0.20, 0.10], k=1)[0],
                    "quarter":           random.choice(["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"]),
                })
                
    df = pd.DataFrame(records)
    df.to_csv("data/marketing_data.csv", index=False)
    print(f"Marketing campaigns: {len(df)} records generated (Fixed ROI)")
    return df

# ── 4. Demand & Supply Data (with Boutique Allocations) ─────────
def generate_supply_data():
    records = []
    
    # 18 months time offsets
    start_date = datetime(2024, 7, 1)
    
    # Generate supply records per product, boutique and date offset
    for category in CATEGORIES:
        for product in PRODUCTS[category]:
            # Product price/unit costs
            unit_cost = {
                "High Jewellery": random.uniform(80000, 320000),
                "Watches":        random.uniform(2500,  18000),
                "Fine Jewellery":  random.uniform(800,   6000),
                "Accessories":     random.uniform(120,   1200),
                "Fragrances":      random.uniform(20,    120)
            }[category]
            
            for boutique in BOUTIQUES:
                sales_mult = boutique["annual_revenue"] / 30.0 # Normalised sales index
                
                # Base demand units per month
                base_demand = {
                    "High Jewellery": random.randint(1, 4),
                    "Watches":        random.randint(8, 48),
                    "Fine Jewellery":  random.randint(12, 75),
                    "Accessories":     random.randint(15, 90),
                    "Fragrances":      random.randint(30, 180)
                }[category]
                
                base_demand = int(max(1, base_demand * sales_mult))
                
                # Loop through 18 months
                for m_idx in range(18):
                    date = start_date + timedelta(days=30 * m_idx)
                    
                    # Seasonal multipliers (Harmonized across all datasets)
                    seasonality_map = {
                        1: 1.45,  # CNY peak
                        2: 1.40,  # CNY peak
                        3: 1.00,  # Spring baseline
                        4: 0.95,  # Post-CNY lull
                        5: 1.10,  # Spring gifting / Mother's day
                        6: 0.90,  # Summer transition
                        7: 0.75,  # Summer lull
                        8: 0.80,  # Summer lull / mid-year
                        9: 1.15,  # Autumn/Golden Week prep
                        10: 1.25, # Golden Week / National Day
                        11: 1.10, # Holiday build-up
                        12: 1.35  # Christmas / New Year
                    }
                    seasonal = seasonality_map.get(date.month, 1.0)
                    
                    forecast = int(base_demand * seasonal)
                    actual = int(forecast * random.uniform(0.85, 1.20))
                    
                    # Available Stock
                    stock = int(forecast * random.uniform(0.70, 1.40))
                    
                    # Waitlist Count (Backlog for Allocation Optimizer)
                    waitlist = 0
                    if category in ["High Jewellery", "Watches", "Fine Jewellery"]:
                        # Tiers dictate waitlist depth
                        w_mult = 2.5 if boutique["tier"] == "Flagship" else 1.2 if boutique["tier"] == "Major" else 0.5
                        waitlist = int(random.randint(1, 14) * w_mult)
                    
                    lead_time = random.randint(14, 90) if boutique["tier"] != "Flagship" else random.randint(10, 45)
                    
                    # Sales velocity (Units per week)
                    velocity = round(actual / 4.2, 1)
                    
                    records.append({
                        "date":              date.strftime("%Y-%m-%d"),
                        "month_year":        date.strftime("%b %Y"),
                        "boutique_id":       boutique["id"],
                        "boutique_name":     boutique["name"],
                        "market":            boutique["market"],
                        "category":          category,
                        "product":           product,
                        "forecast_demand":   forecast,
                        "actual_demand":     actual,
                        "stock_available":   stock,
                        "stock_cover_weeks": round(stock / max(velocity, 0.25), 1),
                        "reorder_point":     int(forecast * 0.4),
                        "lead_time_days":    lead_time,
                        "stockout_risk":     "High" if stock < forecast * 0.45 else "Medium" if stock < forecast * 0.75 else "Low",
                        "overstock_risk":    "High" if stock > forecast * 1.5 else "Medium" if stock > forecast * 1.2 else "Low",
                        "waitlist_count":    waitlist,
                        "sales_velocity":    velocity,
                        "unit_cost_usd":     round(unit_cost, 2)
                    })
                    
    df = pd.DataFrame(records)
    df.to_csv("data/supply_data.csv", index=False)
    print(f"Supply/Demand stock records: {len(df)} records generated")
    return df

# ── 5. KPI Summary Data ────────────────────────────────────────
def generate_kpi_data(sales_df, marketing_df):
    total_rev = sales_df["revenue_usd"].sum()
    cogs_total = sales_df["cogs_usd"].sum()
    gross_margin = (total_rev - cogs_total) / total_rev * 100
    
    # Calculate Marketing ROI
    m_budget = marketing_df["actual_usd"].sum()
    m_revenue = marketing_df["revenue_attributed"].sum()
    m_roi = (m_revenue - m_budget) / m_budget * 100
    
    kpis = {
        "total_revenue_ytd_usd":     float(total_rev),
        "revenue_target_ytd_usd":    float(total_rev * 0.96), # target met by 4.1%
        "revenue_vs_target_pct":     4.1,
        "gross_margin_pct":          round(gross_margin, 1),
        "total_clients_apac":        48320,
        "new_clients_ytd":           6840,
        "vip_clients":               1240,
        "client_retention_rate":     0.847,
        "avg_transaction_value_usd": round(sales_df["revenue_usd"].mean(), 2),
        "nps_score":                 74,
        "top_market":                "China",
        "top_channel":               "Boutique",
        "top_category":              "Watches",
        "marketing_roi_pct":         round(m_roi, 1),
        "inventory_health_pct":      92.4,
        "on_time_delivery_pct":      94.7,
        "digital_revenue_share_pct": 21.8,
        "travel_retail_growth_pct":  16.2
    }
    
    with open("data/kpis.json", "w", encoding="utf-8") as f:
        json.dump(kpis, f, indent=2)
    print("Executive KPIs generated")
    
    # Generate Boutique SA mapping structure for Boutique Analytics
    boutique_sa_list = []
    for bt in BOUTIQUES:
        bt_sas = [sa for sa in SAS if sa["boutique_id"] == bt["id"]]
        boutique_sa_list.append({
            "id": bt["id"],
            "name": bt["name"],
            "market": bt["market"],
            "tier": bt["tier"],
            "lat": bt["lat"],
            "lng": bt["lng"],
            "annualRevenue": bt["annual_revenue"] * 1e6, # Millions
            "saCount": bt["sa_count"],
            "saPerformance": [{
                "id": sa["sa_id"],
                "name": sa["name"],
                "clients": sa["clients_count"],
                "revenue": sa["annual_revenue"],
                "tenure": f"{sa['tenure_years']}y",
                "retention": sa["retention_rate"]
            } for sa in bt_sas]
        })
        
    with open("data/boutiques_hierarchy.json", "w", encoding="utf-8") as f:
        json.dump(boutique_sa_list, f, indent=2, ensure_ascii=False)
    print("Boutique hierarchy structure generated")
    return kpis

# ── 6. RAG Knowledge Base Documents ───────────────────────────
def generate_rag_documents():
    import re
    
    docs_dir = "data/New Knowledge Base"
    if os.path.exists(docs_dir):
        print(f"Reading expanded knowledge base from: {docs_dir}")
        documents = []
        files = [f for f in os.listdir(docs_dir) if f.endswith(".txt") and f != "Knowledge Base Structure.txt"]
        
        for filename in files:
            filepath = os.path.join(docs_dir, filename)
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
                
            # Regex match metadata
            id_match = re.search(r'"id"\s*:\s*"([^"]+)"', content)
            title_match = re.search(r'"title"\s*:\s*"([^"]+)"', content)
            cat_match = re.search(r'"category"\s*:\s*"([^"]+)"', content)
            content_idx_match = re.search(r'"content"\s*:\s*"', content)
            
            if id_match and title_match and cat_match and content_idx_match:
                doc_id = id_match.group(1)
                doc_title = title_match.group(1)
                doc_category = cat_match.group(1)
                
                # Extract content after content start indicator
                start_pos = content_idx_match.end()
                raw_content = content[start_pos:]
                
                # Clean trailing quotes and braces
                clean_content = raw_content.strip()
                if clean_content.endswith('}'):
                    clean_content = clean_content[:-1].strip()
                if clean_content.endswith('"'):
                    clean_content = clean_content[:-1]
                
                # Fix duplicate ID conflict for L&D (DOC-013)
                if doc_id == "DOC-013" and doc_category == "People & Training":
                    doc_id = "DOC-020"
                    
                documents.append({
                    "id": doc_id,
                    "title": doc_title,
                    "category": doc_category,
                    "content": clean_content.strip()
                })
            else:
                print(f"Warning: could not parse metadata in {filename}")
                
        if len(documents) > 0:
            with open("data/rag_documents.json", "w", encoding="utf-8") as f:
                json.dump(documents, f, indent=2, ensure_ascii=False)
            print(f"RAG knowledge base: {len(documents)} documents parsed and saved")
            return documents

    # Fallback to default baseline documents if directory not present
    print("New Knowledge Base directory not found or empty. Using default RAG documents.")
    documents = [
        {
            "id": "DOC-001",
            "title": "Aurelle APAC Sales Strategy 2025",
            "category": "Strategy",
            "content": """
Aurelle APAC Sales Strategy 2025 — Executive Summary

The APAC region represents a pivotal growth engine for Aurelle globally, aiming for USD 620M in revenue. 
Key growth pillars include: (1) Mainstream China expansion via flagship boutiques in Chengdu Taikoo Li and Shenzhen MixC, boosting physical footprints while capturing tourist recovery; (2) Watches category leadership with 38% revenue share, anchored by Santos de Aurelle, Tank Must, and Ballon Bleu; (3) Omnichannel digitalization scaling to 22% of total revenue via WeChat Mini-Programs and LINE CRM platforms.

Boutique network serves as our primary touchpoint representing 60% of total revenue. Private Client Salon viewings (Maison Mansions) show the highest margins at 76.8% and highest retention rates.
Target KPI repeat client rate is 65% APAC-wide.
            """.strip()
        },
        {
            "id": "DOC-002",
            "title": "High Jewellery Launch Protocol - APAC",
            "category": "Operations",
            "content": """
High Jewellery Collections — APAC Launch & Client Engagement Protocol

Pre-Launch (T-90 days): Personal stylist briefings across all regional flagships. Curate VIC invitation list with minimum lifetime value (CLV) threshold of USD 150,000 for private previews.

Private Viewing Events: Held inside flagship salons (Plaza 66 Shanghai, Mansion Tokyo Ginza, Cheongdam Seoul, Landmark HK, ION Singapore). Format: private salon spaces, 1-on-1 stylist assistance, champagne service, and presentation by regional Gemologist.
Pricing: High Jewellery pricing is set strictly at European HQ level. APAC Market Directors may apply up to a maximum of 3% service adjustment for custom fittings or extensions. Discounts are strictly prohibited.
            """.strip()
        },
        {
            "id": "DOC-003",
            "title": "Client Segmentation & CRM Guidelines",
            "category": "CRM",
            "content": """
Aurelle APAC Client Segmentation Framework

Tier 1 — Maison VIP (CLV > USD 50,000):
- Dedicated Personal Stylist assigned.
- Priority access to limited editions and pre-launches.
- Annual bespoke gifting budget: USD 2,500 per client.
- Invitations to global events (Watches & Wonders Geneva, Paris High Jewellery Gala).
- Target touchpoint frequency: minimum twice monthly.

Tier 2 — Premium (CLV USD 10,000–50,000):
- Shared stylist model (1 stylist per 20 clients).
- In-boutique preview invitations and seasonal catalogs.
- Target touchpoint frequency: monthly.

Tier 3 — Aspirational (CLV USD 1,000–10,000):
- Digital-led CRM (email, WeChat, LINE, KakaoTalk).
- Curated recommendations based on entry points (Trinity, Fragrances).

Churn Prevention: Clients with >180 days since last purchase are flagged as Medium Risk, and >270 days as High Risk. Outreaches must be customized based on preferred categories.
            """.strip()
        },
        {
            "id": "DOC-004",
            "title": "Supply Chain & Allocation Policy APAC",
            "category": "Supply Chain",
            "content": """
APAC Supply Chain Management — Inventory & Boutique Allocation Policy

Regional Hubs: Singapore Distribution Centre (SDC) supplies Southeast Asia. North Asia (China, HK, Japan, Korea) is supplied directly from Switzerland via air freight.

Allocation Optimizer Protocol:
Limited stock of hot products (e.g. Tank Must, LOVE Bracelet Classics) must be distributed using the optimization engine based on:
1. CRM waitlist backlog: Prioritize stores with VIP clients awaiting delivery.
2. Sales Velocity: Allocate to stores with higher turnover rates.
3. Boutique Tier: Flagship salons receive priority allocations.
4. Stock Cover: Low cover weeks trigger urgent replenishment.

Emergency stock requests can be filed by boutique directors directly to Switzerland for active VIP sales closures, with delivery within 5 business days.
            """.strip()
        }
    ]
    with open("data/rag_documents.json", "w", encoding="utf-8") as f:
        json.dump(documents, f, indent=2, ensure_ascii=False)
    print(f"RAG knowledge base: {len(documents)} documents generated")
    return documents

# ── Main ───────────────────────────────────────────────────────
if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    print("\nOverhauling Aurelle APAC synthetic data...\n")
    generate_crm_data()
    sales_df = generate_sales_data()
    mkt_df = generate_marketing_data()
    generate_supply_data()
    generate_kpi_data(sales_df, mkt_df)
    generate_rag_documents()
    print("\nRebuilding LightRAG Knowledge Graph index...\n")
    import utils.vector_store
    utils.vector_store.rebuild_index()
    print("\nAll datasets and LightRAG indices overhauled and generated successfully.\n")