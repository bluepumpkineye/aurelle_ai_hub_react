import sys
import os
import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# Ensure root directory is on the path so we can import from data.generate_data
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from data.generate_data import BOUTIQUES

# Seed random number generators for reproducibility
random.seed(42)
np.random.seed(42)

# --- Configuration & Product/SKU Mapping ---
# Product Details based on supply_data.csv costs
PRODUCT_INFO = {
    # High Jewellery
    "HJ-PANTHERE-NECK": {
        "parent_product": "Maison Panthère Necklace",
        "collection": "High Jewellery",
        "category": "High Jewellery",
        "name": "Maison Panthère Necklace, Platinum & Diamonds",
        "cost": 259608.60,
        "is_core": False
    },
    "HJ-TRINITY-CUFF": {
        "parent_product": "Trinity HJ Cuff",
        "collection": "High Jewellery",
        "category": "High Jewellery",
        "name": "Trinity HJ Cuff, White/Yellow/Rose Gold & Diamonds",
        "cost": 228231.04,
        "is_core": False
    },
    "HJ-CACTUS-COLL": {
        "parent_product": "Cactus de Aurelle Collier",
        "collection": "High Jewellery",
        "category": "High Jewellery",
        "name": "Cactus de Aurelle Collier, Yellow Gold & Emeralds",
        "cost": 299658.81,
        "is_core": False
    },
    "HJ-LOVE-BRAC": {
        "parent_product": "LOVE Bracelet HJ",
        "collection": "High Jewellery",
        "category": "High Jewellery",
        "name": "LOVE Bracelet HJ, Pink Gold & Diamonds",
        "cost": 135813.52,
        "is_core": False
    },
    # Watches
    "W-SANTOS-M-SS-BLK": {
        "parent_product": "Santos de Aurelle",
        "collection": "Santos",
        "category": "Watches",
        "name": "Santos de Aurelle Watch, Medium, Steel, Black Dial",
        "cost": 12418.57,
        "is_core": True
    },
    "W-SANTOS-L-YG-BRN": {
        "parent_product": "Santos de Aurelle",
        "collection": "Santos",
        "category": "Watches",
        "name": "Santos de Aurelle Watch, Large, Yellow Gold, Brown Strap",
        "cost": 28000.00,
        "is_core": False
    },
    "W-SANTOS-L-SS-WHT": {
        "parent_product": "Santos de Aurelle",
        "collection": "Santos",
        "category": "Watches",
        "name": "Santos de Aurelle Watch, Large, Steel, White Dial",
        "cost": 14500.00,
        "is_core": True
    },
    "W-TANK-S-SS-WHT": {
        "parent_product": "Tank Must",
        "collection": "Tank",
        "category": "Watches",
        "name": "Tank Must Watch, Small, Steel, Silver Dial",
        "cost": 7843.85,
        "is_core": True
    },
    "W-TANK-L-SS-BLK": {
        "parent_product": "Tank Must",
        "collection": "Tank",
        "category": "Watches",
        "name": "Tank Must Watch, Large, Steel, Black Dial",
        "cost": 8900.00,
        "is_core": False
    },
    "W-TANK-M-YG-SLV": {
        "parent_product": "Tank Must",
        "collection": "Tank",
        "category": "Watches",
        "name": "Tank Must Watch, Medium, Yellow Gold, Silver Dial",
        "cost": 18500.00,
        "is_core": False
    },
    "W-BBLUE-M-SS-BLU": {
        "parent_product": "Ballon Bleu de Aurelle",
        "collection": "Ballon Bleu",
        "category": "Watches",
        "name": "Ballon Bleu de Aurelle Watch, Medium, Steel, Blue Dial",
        "cost": 16128.28,
        "is_core": False
    },
    "W-BBLUE-L-YG-SLV": {
        "parent_product": "Ballon Bleu de Aurelle",
        "collection": "Ballon Bleu",
        "category": "Watches",
        "name": "Ballon Bleu de Aurelle Watch, Large, Yellow Gold, Silver Dial",
        "cost": 24000.00,
        "is_core": False
    },
    "W-BBLUE-S-SS-PNK": {
        "parent_product": "Ballon Bleu de Aurelle",
        "collection": "Ballon Bleu",
        "category": "Watches",
        "name": "Ballon Bleu de Aurelle Watch, Small, Steel, Pink Dial",
        "cost": 12000.00,
        "is_core": False
    },
    "W-PANTHERE-S-YG-WHT": {
        "parent_product": "Panthère de Aurelle Watch",
        "collection": "Panthère",
        "category": "Watches",
        "name": "Panthère de Aurelle Watch, Small, Yellow Gold, White Dial",
        "cost": 9074.71,
        "is_core": True
    },
    "W-PANTHERE-M-SS-SLV": {
        "parent_product": "Panthère de Aurelle Watch",
        "collection": "Panthère",
        "category": "Watches",
        "name": "Panthère de Aurelle Watch, Medium, Steel, Silver Dial",
        "cost": 7500.00,
        "is_core": False
    },
    "W-PANTHERE-S-SS-SLV": {
        "parent_product": "Panthère de Aurelle Watch",
        "collection": "Panthère",
        "category": "Watches",
        "name": "Panthère de Aurelle Watch, Small, Steel, Silver Dial",
        "cost": 6200.00,
        "is_core": False
    },
    "W-BAIGNOIRE-XS-YG": {
        "parent_product": "Baignoire Watch",
        "collection": "Baignoire",
        "category": "Watches",
        "name": "Baignoire Watch, Extra-Small, Yellow Gold, Leather Strap",
        "cost": 3048.34,
        "is_core": False
    },
    "W-BAIGNOIRE-S-WG-DM": {
        "parent_product": "Baignoire Watch",
        "collection": "Baignoire",
        "category": "Watches",
        "name": "Baignoire Watch, Small, White Gold, Diamond Bezel",
        "cost": 16500.00,
        "is_core": False
    },
    "W-BAIGNOIRE-M-YG": {
        "parent_product": "Baignoire Watch",
        "collection": "Baignoire",
        "category": "Watches",
        "name": "Baignoire Watch, Medium, Yellow Gold",
        "cost": 12500.00,
        "is_core": False
    },
    # Fine Jewellery
    "J-LOVE-BRAC-YG": {
        "parent_product": "LOVE Bracelet Classic",
        "collection": "Love",
        "category": "Fine Jewellery",
        "name": "LOVE Bracelet, Classic, Yellow Gold",
        "cost": 2867.73,
        "is_core": True
    },
    "J-LOVE-BRAC-WG": {
        "parent_product": "LOVE Bracelet Classic",
        "collection": "Love",
        "category": "Fine Jewellery",
        "name": "LOVE Bracelet, Classic, White Gold",
        "cost": 3100.00,
        "is_core": True
    },
    "J-LOVE-BRAC-PG": {
        "parent_product": "LOVE Bracelet Classic",
        "collection": "Love",
        "category": "Fine Jewellery",
        "name": "LOVE Bracelet, Classic, Pink Gold",
        "cost": 2950.00,
        "is_core": False
    },
    "J-LOVE-RING-YG": {
        "parent_product": "LOVE Bracelet Classic",  # Map to Love Classic parent
        "collection": "Love",
        "category": "Fine Jewellery",
        "name": "LOVE Ring, Yellow Gold",
        "cost": 1800.00,
        "is_core": True
    },
    "J-LOVE-RING-WG": {
        "parent_product": "LOVE Bracelet Classic",
        "collection": "Love",
        "category": "Fine Jewellery",
        "name": "LOVE Ring, White Gold",
        "cost": 1950.00,
        "is_core": False
    },
    "J-JUC-BRAC-YG": {
        "parent_product": "Juste un Clou Bracelet",
        "collection": "Juste un Clou",
        "category": "Fine Jewellery",
        "name": "Juste un Clou Bracelet, Yellow Gold",
        "cost": 4741.44,
        "is_core": True
    },
    "J-JUC-BRAC-WG": {
        "parent_product": "Juste un Clou Bracelet",
        "collection": "Juste un Clou",
        "category": "Fine Jewellery",
        "name": "Juste un Clou Bracelet, White Gold",
        "cost": 5100.00,
        "is_core": False
    },
    "J-JUC-RING-YG": {
        "parent_product": "Juste un Clou Bracelet",
        "collection": "Juste un Clou",
        "category": "Fine Jewellery",
        "name": "Juste un Clou Ring, Yellow Gold",
        "cost": 2200.00,
        "is_core": True
    },
    "J-CLASH-RING-RG": {
        "parent_product": "Clash de Aurelle Ring",
        "collection": "Clash",
        "category": "Fine Jewellery",
        "name": "Clash de Aurelle Ring, Rose Gold, Medium",
        "cost": 3879.40,
        "is_core": False
    },
    "J-CLASH-RING-WG": {
        "parent_product": "Clash de Aurelle Ring",
        "collection": "Clash",
        "category": "Fine Jewellery",
        "name": "Clash de Aurelle Ring, White Gold, Small",
        "cost": 4150.00,
        "is_core": False
    },
    "J-CLASH-BRAC-RG": {
        "parent_product": "Clash de Aurelle Ring",
        "collection": "Clash",
        "category": "Fine Jewellery",
        "name": "Clash de Aurelle Bracelet, Rose Gold",
        "cost": 8500.00,
        "is_core": False
    },
    "J-TRINITY-RING-CL": {
        "parent_product": "Trinity Ring Classic",
        "collection": "Trinity",
        "category": "Fine Jewellery",
        "name": "Trinity Ring, Classic, Three Golds",
        "cost": 1693.47,
        "is_core": True
    },
    "J-TRINITY-RING-LM": {
        "parent_product": "Trinity Ring Classic",
        "collection": "Trinity",
        "category": "Fine Jewellery",
        "name": "Trinity Ring, Large Model, Three Golds",
        "cost": 2850.00,
        "is_core": False
    },
    "J-TRINITY-BRAC-CL": {
        "parent_product": "Trinity Ring Classic",
        "collection": "Trinity",
        "category": "Fine Jewellery",
        "name": "Trinity Bracelet, Classic, Three Golds",
        "cost": 6500.00,
        "is_core": False
    },
    "J-DAMOUR-NECK-WG": {
        "parent_product": "Aurelle d'Amour Necklace",
        "collection": "Aurelle d'Amour",
        "category": "Fine Jewellery",
        "name": "Aurelle d'Amour Necklace, White Gold & Diamond",
        "cost": 5834.47,
        "is_core": False
    },
    "J-DAMOUR-NECK-YG": {
        "parent_product": "Aurelle d'Amour Necklace",
        "collection": "Aurelle d'Amour",
        "category": "Fine Jewellery",
        "name": "Aurelle d'Amour Necklace, Yellow Gold & Diamond",
        "cost": 5500.00,
        "is_core": False
    }
}

# ----------------------------------------------------------------
# 1. Generate Boutique Metadata
# ----------------------------------------------------------------
print("Generating boutique metadata...")
boutique_meta_records = []

CITY_INFO = {
    "hk-1": {"city": "Hong Kong", "mall": "Landmark Prince's"},
    "hk-2": {"city": "Hong Kong", "mall": "The Peninsula"},
    "cn-1": {"city": "Shanghai", "mall": "Plaza 66"},
    "cn-2": {"city": "Shanghai", "mall": "Jing An Kerry Centre"},
    "cn-3": {"city": "Beijing", "mall": "SKP Beijing"},
    "cn-4": {"city": "Chengdu", "mall": "Taikoo Li Chengdu"},
    "cn-5": {"city": "Shenzhen", "mall": "MixC Shenzhen"},
    "jp-1": {"city": "Tokyo", "mall": "Ginza Mansion"},
    "jp-2": {"city": "Tokyo", "mall": "Omotesando"},
    "jp-3": {"city": "Osaka", "mall": "Shinsaibashi"},
    "kr-1": {"city": "Seoul", "mall": "Cheongdam Maison"},
    "kr-2": {"city": "Seoul", "mall": "Lotte Main Store"},
    "sg-1": {"city": "Singapore", "mall": "ION Orchard"},
    "au-1": {"city": "Sydney", "mall": "Castlereagh St"},
    "au-2": {"city": "Melbourne", "mall": "Collins St"},
    "tw-1": {"city": "Taipei", "mall": "Taipei 101"},
    "mo-1": {"city": "Macau", "mall": "Wynn Palace"},
    "th-1": {"city": "Bangkok", "mall": "Siam Paragon"},
    "in-1": {"city": "Delhi", "mall": "DLF Chanakya"}
}

for bt in BOUTIQUES:
    bid = bt["id"]
    # Determine tier
    if bid in ["cn-1", "jp-1", "sg-1"]:
        tier = "Flagship Maison"
        allocation_tier = "Tier 1"
        size = random.randint(700, 950)
        has_private = True
        has_hj = True
        has_csc = True
        vic_count = random.randint(350, 480)
        footfall = random.randint(600000, 950000)
    elif bid in ["hk-1", "cn-3", "kr-1"]:
        tier = "Flagship"
        allocation_tier = "Tier 2"
        size = random.randint(400, 580)
        has_private = True
        has_hj = True
        has_csc = True
        vic_count = random.randint(200, 320)
        footfall = random.randint(350000, 500000)
    elif bid in ["in-1", "th-1"]:
        tier = "Emerging"
        allocation_tier = "Tier 4"
        size = random.randint(120, 180)
        has_private = False
        has_hj = False
        has_csc = False
        vic_count = random.randint(25, 45)
        footfall = random.randint(60000, 95000)
    else:
        tier = "Standard"
        allocation_tier = "Tier 3"
        size = random.randint(220, 380)
        has_private = random.choice([True, False])
        has_hj = False
        has_csc = False
        vic_count = random.randint(60, 140)
        footfall = random.randint(120000, 280000)

    city = CITY_INFO[bid]["city"]
    mall = CITY_INFO[bid]["mall"]
    open_year = random.randint(2005, 2021)
    reno_year = random.randint(2020, 2025)
    
    dist_hub = "Singapore DC"
    csc_routing = "Direct" if has_csc else "Hub"
    rent = size * random.randint(800, 1500)
    rev_per_sqm = (bt["annual_revenue"] * 1000000) / size

    boutique_meta_records.append({
        "boutique_id": bid,
        "boutique_name": bt["name"],
        "market": bt["market"],
        "city": city,
        "mall_location": mall,
        "boutique_tier": tier,
        "size_sqm": size,
        "has_private_salon": has_private,
        "has_hj_gallery": has_hj,
        "has_csc": has_csc,
        "opening_year": open_year,
        "last_renovation_year": reno_year,
        "total_sa_count": bt["sa_count"],
        "vic_client_count": vic_count,
        "annual_footfall": footfall,
        "allocation_tier": allocation_tier,
        "csc_routing": csc_routing,
        "distribution_hub": dist_hub,
        "annual_rent_usd": rent,
        "revenue_per_sqm": round(rev_per_sqm, 2)
    })

df_meta = pd.DataFrame(boutique_meta_records)
df_meta.to_csv("data/boutique_metadata.csv", index=False)
print(f"Boutique metadata saved. {len(df_meta)} rows.")

TIER_LOOKUP = df_meta.set_index("boutique_id")["boutique_tier"].to_dict()
HJ_GALLERY_LOOKUP = df_meta.set_index("boutique_id")["has_hj_gallery"].to_dict()

# ----------------------------------------------------------------
# 2. Generate Model Stock Targets
# ----------------------------------------------------------------
print("Generating model stock targets...")
model_stock_records = []

for bid, tier in TIER_LOOKUP.items():
    bt_name = next(b["name"] for b in BOUTIQUES if b["id"] == bid)
    market = next(b["market"] for b in BOUTIQUES if b["id"] == bid)
    has_hj = HJ_GALLERY_LOOKUP[bid]
    
    for sku, info in PRODUCT_INFO.items():
        carry = False
        target = 0
        min_stock = 1
        
        # Assortment & targets based on tier
        if info["category"] == "High Jewellery":
            if has_hj:
                carry = True
                target = 1  # HJ always 1 target per boutique with HJ gallery
                min_stock = 0
        else:
            if tier == "Flagship Maison":
                carry = True
                # Large targets
                if info["is_core"]:
                    target = random.randint(5, 8)
                else:
                    target = random.randint(3, 5)
            elif tier == "Flagship":
                carry = True
                if info["is_core"]:
                    target = random.randint(3, 5)
                else:
                    target = random.randint(2, 3)
            elif tier == "Standard":
                # Standard carry core products, and most other products
                if info["is_core"]:
                    carry = True
                    target = random.randint(2, 3)
                else:
                    # 75% chance of carrying non-core standard watches/fine jewellery
                    if random.random() > 0.25:
                        carry = True
                        target = random.randint(1, 2)
            elif tier == "Emerging":
                # Emerging carry core products, and 40% of non-core products
                if info["is_core"]:
                    carry = True
                    target = random.randint(1, 2)
                else:
                    if random.random() > 0.6:
                        carry = True
                        target = 1

        if carry:
            model_stock_records.append({
                "boutique_id": bid,
                "boutique_name": bt_name,
                "market": market,
                "boutique_tier": tier,
                "category": info["category"],
                "collection": info["collection"],
                "reference_sku": sku,
                "reference_name": info["name"],
                "model_stock_target": target,
                "min_stock_level": min_stock,
                "unit_cost_usd": info["cost"],
                "model_stock_value": round(target * info["cost"], 2),
                "is_core_reference": info["is_core"],
                "review_cycle": "Monthly" if info["category"] == "High Jewellery" else "Quarterly",
                "last_reviewed_date": "2026-05-15",
                "notes": f"Standard stock plan for {info['collection']}."
            })

df_targets = pd.DataFrame(model_stock_records)
df_targets.to_csv("data/model_stock_targets.csv", index=False)
print(f"Model stock targets saved. {len(df_targets)} rows.")

# Verify total values per boutique tier
summary_vals = df_targets.groupby("boutique_tier")["model_stock_value"].sum() / df_targets.groupby("boutique_tier")["boutique_id"].nunique()
print("Average model stock value by tier:")
print(summary_vals.apply(lambda x: f"${x/1000000:.2f}M"))

# ----------------------------------------------------------------
# 3. Generate Inbound Shipments
# ----------------------------------------------------------------
print("Generating inbound shipments...")
inbound_records = []

# Generate ~200 rows of inbound shipments
statuses = ["Delivered", "In Transit", "Delayed", "Customs Hold", "Ordered"]
delay_reasons = {
    "Customs Hold": "Customs clearance delay",
    "Delayed": "Logistics congestion"
}

ref_date = datetime(2026, 6, 24)

for i in range(200):
    shp_id = f"SHP-2026-{i+1001:04d}"
    
    # Select random target SKU row
    target_row = random.choice(model_stock_records)
    bid = target_row["boutique_id"]
    bt_name = target_row["boutique_name"]
    market = target_row["market"]
    cat = target_row["category"]
    sku = target_row["reference_sku"]
    cost = target_row["unit_cost_usd"]
    
    # Parent product
    prod_name = PRODUCT_INFO[sku]["parent_product"]
    
    status = random.choices(statuses, weights=[0.40, 0.35, 0.12, 0.08, 0.05], k=1)[0]
    
    if cat == "High Jewellery":
        units = 1
    elif cat == "Watches":
        units = random.randint(2, 6)
    else:
        units = random.randint(5, 15)
        
    origin = "Switzerland Factory" if random.random() > 0.4 else "Singapore DC"
    dest_hub = "Singapore DC" if market in ["Singapore", "Australia", "India", "Thailand"] else "Hong Kong Hub"
    
    # Dates
    if status == "Delivered":
        ship_date = ref_date - timedelta(days=random.randint(10, 30))
        est_arrival = ship_date + timedelta(days=random.randint(5, 12))
        act_arrival = est_arrival + timedelta(days=random.randint(-1, 3))
        delay_days = max(0, (act_arrival - est_arrival).days)
        customs = "Cleared"
    elif status == "In Transit":
        ship_date = ref_date - timedelta(days=random.randint(2, 7))
        est_arrival = ship_date + timedelta(days=random.randint(5, 12))
        act_arrival = ""
        delay_days = 0
        customs = "Cleared" if random.random() > 0.2 else "Pending"
    elif status == "Delayed":
        ship_date = ref_date - timedelta(days=random.randint(8, 15))
        est_arrival = ship_date + timedelta(days=random.randint(5, 8))
        act_arrival = ""
        delay_days = random.randint(3, 8)
        customs = "Pending"
    elif status == "Customs Hold":
        ship_date = ref_date - timedelta(days=random.randint(6, 12))
        est_arrival = ship_date + timedelta(days=random.randint(5, 8))
        act_arrival = ""
        delay_days = random.randint(4, 10)
        customs = "Under Review"
    else:  # Ordered
        ship_date = ref_date + timedelta(days=random.randint(1, 7))
        est_arrival = ship_date + timedelta(days=random.randint(5, 15))
        act_arrival = ""
        delay_days = 0
        customs = "N/A"
        
    reason = delay_reasons.get(status, "")
    
    linked_vic = ""
    priority = False
    if cat == "High Jewellery" or random.random() > 0.85:
        priority = True
        linked_vic = f"CRT-{market[:2].upper()}-{random.randint(1000, 3500)}"
        
    mode = "Air Freight" if cat in ["High Jewellery", "Watches"] else "Courier"
    val = units * cost
    
    inbound_records.append({
        "shipment_id": shp_id,
        "origin": origin,
        "destination_hub": dest_hub,
        "destination_boutique": bt_name,
        "market": market,
        "category": cat,
        "product": prod_name,
        "reference_sku": sku,
        "units_ordered": units,
        "units_shipped": units if status != "Ordered" else 0,
        "ship_date": ship_date.strftime("%Y-%m-%d") if isinstance(ship_date, datetime) else ship_date,
        "estimated_arrival": est_arrival.strftime("%Y-%m-%d") if isinstance(est_arrival, datetime) else est_arrival,
        "actual_arrival": act_arrival.strftime("%Y-%m-%d") if isinstance(act_arrival, datetime) else act_arrival,
        "shipment_status": status,
        "transport_mode": mode,
        "customs_status": customs,
        "delay_days": delay_days,
        "delay_reason": reason,
        "priority_flag": priority,
        "linked_vic_client": linked_vic,
        "unit_cost_usd": round(cost, 2),
        "total_shipment_value": round(val, 2)
    })

df_ship = pd.DataFrame(inbound_records)
df_ship.to_csv("data/inbound_shipments.csv", index=False)
print(f"Inbound shipments saved. {len(df_ship)} rows.")
print("Successfully generated all new datasets!")
