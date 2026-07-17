import sqlite3
import json
import time
import uuid
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "scenarios.db"

# Default weights by role
DEFAULT_WEIGHTS = {
    "vm": {
        "revenue": 0.1,
        "traffic": 0.1,
        "dwell": 0.1,
        "stockRisk": 0.1,
        "adjacency": 0.3,
        "density": 0.1,
        "visibility": 0.2,
    },
    "retailOps": {
        "revenue": 0.15,
        "traffic": 0.25,
        "dwell": 0.2,
        "stockRisk": 0.1,
        "adjacency": 0.1,
        "density": 0.15,
        "visibility": 0.05,
    },
    "merchandising": {
        "revenue": 0.2,
        "traffic": 0.1,
        "dwell": 0.1,
        "stockRisk": 0.3,
        "adjacency": 0.1,
        "density": 0.05,
        "visibility": 0.15,
    },
    "executive": {
        "revenue": 0.5,
        "traffic": 0.1,
        "dwell": 0.1,
        "stockRisk": 0.1,
        "adjacency": 0.1,
        "density": 0.05,
        "visibility": 0.05,
    }
}

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        # 1. Scenarios Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scenarios (
                id TEXT PRIMARY KEY,
                store_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                baseline_scenario_id TEXT,
                version_number INTEGER DEFAULT 1,
                created_by TEXT,
                created_at TEXT,
                status TEXT DEFAULT 'draft',
                notes TEXT,
                approval_state TEXT DEFAULT 'draft',
                scenario_payload_json TEXT NOT NULL,
                metric_payload_json TEXT
            )
        """)
        # 2. Scenario Versions Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scenario_versions (
                id TEXT PRIMARY KEY,
                scenario_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                scenario_payload_json TEXT NOT NULL,
                metric_payload_json TEXT,
                created_at TEXT,
                created_by TEXT,
                notes TEXT,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
            )
        """)
        # 3. Scenario ChangeLog Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scenario_changelog (
                id TEXT PRIMARY KEY,
                scenario_id TEXT NOT NULL,
                action TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                user TEXT NOT NULL,
                details TEXT,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
            )
        """)
        # 4. Scenario Weights Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scenario_weights (
                role TEXT PRIMARY KEY,
                weights_json TEXT NOT NULL
            )
        """)

        # Seed default weights
        for role, w in DEFAULT_WEIGHTS.items():
            conn.execute(
                "INSERT OR IGNORE INTO scenario_weights (role, weights_json) VALUES (?, ?)",
                (role, json.dumps(w))
            )
        conn.commit()

# --- Audit helper ---
def log_change(conn, scenario_id, action, user, details=""):
    conn.execute(
        "INSERT INTO scenario_changelog (id, scenario_id, action, timestamp, user, details) VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), scenario_id, action, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), user, details)
    )

# --- CRUD Operations ---
def list_scenarios(store_id: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM scenarios WHERE store_id = ? ORDER BY created_at DESC",
            (store_id,)
        ).fetchall()
        return [dict(r) for r in rows]

def get_scenario(scenario_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        return dict(row) if row else None

def create_scenario(store_id: str, name: str, description: str, creator: str, payload: dict, baseline_id: str = None) -> dict:
    scenario_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    metrics = score_scenario(payload)
    
    with get_db() as conn:
        conn.execute(
            """INSERT INTO scenarios 
               (id, store_id, name, description, baseline_scenario_id, version_number, created_by, created_at, status, approval_state, scenario_payload_json, metric_payload_json) 
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'draft', 'draft', ?, ?)""",
            (scenario_id, store_id, name, description, baseline_id, creator, now, json.dumps(payload), json.dumps(metrics))
        )
        # Create version 1
        version_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO scenario_versions 
               (id, scenario_id, version_number, scenario_payload_json, metric_payload_json, created_at, created_by, notes) 
               VALUES (?, ?, 1, ?, ?, ?, ?, 'Initial creation')""",
            (version_id, scenario_id, json.dumps(payload), json.dumps(metrics), now, creator)
        )
        log_change(conn, scenario_id, "create", creator, f"Scenario created: {name}")
        conn.commit()
    
    return {"id": scenario_id, "name": name, "metrics": metrics}

def update_scenario(scenario_id: str, name: str, description: str, payload: dict, user: str, status: str = None, approval_state: str = None, notes: str = None) -> dict:
    metrics = score_scenario(payload)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        if not row:
            raise ValueError("Scenario not found")
        
        status = status or row["status"]
        approval_state = approval_state or row["approval_state"]
        
        # If scenario status is baseline or winner, update other scenarios to ensure only one has that status per store_id
        if status in ("baseline", "winner"):
            conn.execute(
                "UPDATE scenarios SET status = 'draft' WHERE store_id = ? AND id != ? AND status = ?",
                (row["store_id"], scenario_id, status)
            )

        conn.execute(
            """UPDATE scenarios SET 
               name = ?, description = ?, status = ?, approval_state = ?, notes = ?, scenario_payload_json = ?, metric_payload_json = ?
               WHERE id = ?""",
            (name, description, status, approval_state, notes, json.dumps(payload), json.dumps(metrics), scenario_id)
        )
        log_change(conn, scenario_id, "update", user, f"Scenario layout updated. Score: {metrics['score']:.1f}")
        conn.commit()
    return {"id": scenario_id, "name": name, "metrics": metrics}

def delete_scenario(scenario_id: str, user: str):
    with get_db() as conn:
        row = conn.execute("SELECT status FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        if not row:
            raise ValueError("Scenario not found")
        if row["status"] in ("baseline", "winner"):
            raise ValueError(f"Cannot delete active '{row['status']}' scenario.")
        
        conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
        conn.commit()

def duplicate_scenario(scenario_id: str, name: str, user: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        if not row:
            raise ValueError("Source scenario not found")
        
        new_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        conn.execute(
            """INSERT INTO scenarios 
               (id, store_id, name, description, baseline_scenario_id, version_number, created_by, created_at, status, approval_state, scenario_payload_json, metric_payload_json) 
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'draft', 'draft', ?, ?)""",
            (new_id, row["store_id"], name, f"Copy of {row['name']}", row["baseline_scenario_id"], user, now, row["scenario_payload_json"], row["metric_payload_json"])
        )
        # Version 1
        conn.execute(
            """INSERT INTO scenario_versions 
               (id, scenario_id, version_number, scenario_payload_json, metric_payload_json, created_at, created_by, notes) 
               VALUES (?, ?, 1, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), new_id, row["scenario_payload_json"], row["metric_payload_json"], now, user, f"Cloned from {row['name']}")
        )
        log_change(conn, new_id, "duplicate", user, f"Scenario duplicated from {row['name']}")
        conn.commit()
    return {"id": new_id, "name": name}

# --- Versioning ---
def create_version(scenario_id: str, creator: str, notes: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        if not row:
            raise ValueError("Scenario not found")
        
        next_ver = row["version_number"] + 1
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        ver_id = str(uuid.uuid4())
        
        conn.execute(
            """INSERT INTO scenario_versions 
               (id, scenario_id, version_number, scenario_payload_json, metric_payload_json, created_at, created_by, notes) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (ver_id, scenario_id, next_ver, row["scenario_payload_json"], row["metric_payload_json"], now, creator, notes)
        )
        conn.execute(
            "UPDATE scenarios SET version_number = ? WHERE id = ?",
            (next_ver, scenario_id)
        )
        log_change(conn, scenario_id, "save_version", creator, f"Snapshot version {next_ver} saved: {notes}")
        conn.commit()
    return {"version_number": next_ver, "created_at": now}

def list_versions(scenario_id: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, version_number, created_at, created_by, notes FROM scenario_versions WHERE scenario_id = ? ORDER BY version_number DESC",
            (scenario_id,)
        ).fetchall()
        return [dict(r) for r in rows]

def restore_version(scenario_id: str, version_number: int, user: str) -> dict:
    with get_db() as conn:
        ver = conn.execute(
            "SELECT * FROM scenario_versions WHERE scenario_id = ? AND version_number = ?",
            (scenario_id, version_number)
        ).fetchone()
        if not ver:
            raise ValueError("Version not found")
        
        conn.execute(
            "UPDATE scenarios SET scenario_payload_json = ?, metric_payload_json = ? WHERE id = ?",
            (ver["scenario_payload_json"], ver["metric_payload_json"], scenario_id)
        )
        log_change(conn, scenario_id, "restore_version", user, f"Restored scenario snapshot to version {version_number}")
        conn.commit()
        return {
            "scenario_payload": json.loads(ver["scenario_payload_json"]),
            "metric_payload": json.loads(ver["metric_payload_json"])
        }

# --- Weights Management ---
def get_weights():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM scenario_weights").fetchall()
        return {r["role"]: json.loads(r["weights_json"]) for r in rows}

def save_weights(role: str, weights: dict):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO scenario_weights (role, weights_json) VALUES (?, ?)",
            (role, json.dumps(weights))
        )
        conn.commit()

# --- Scoring Engine ---
def score_scenario(payload: dict) -> dict:
    fixtures = payload.get("fixtures", [])
    slots = payload.get("slots", {})
    # If slots is a list, convert to a dict
    if isinstance(slots, list):
        slots_dict = {}
        for item in slots:
            if "key" in item:
                slots_dict[item["key"]] = item
        slots = slots_dict

    zones = payload.get("zones", [])
    floor = payload.get("floor", {"width": 20, "depth": 16})
    
    width = floor.get("width", 20)
    depth = floor.get("depth", 16)
    area = max(width * depth, 1)

    # 1. Space Efficiency (Optimum density is ~0.18 to 0.24 cases per sqm)
    phy_fixtures = [f for f in fixtures if not f.get("templateId", "").startswith("light-")]
    fixture_count = len(phy_fixtures)
    density = fixture_count / area
    opt_density = 0.21
    density_diff = abs(density - opt_density)
    space_eff = max(0, 100 - (density_diff * 400)) # sharp drop if too sparse or too dense

    # 2. Zone Balance (entropy / variance of fixture density in non-arrival zones)
    zone_counts = {}
    for f in phy_fixtures:
        zid = f.get("zoneId")
        if zid:
            zone_counts[zid] = zone_counts.get(zid, 0) + 1
    
    if len(zones) > 1:
        avg_fx = fixture_count / len(zones)
        variance = sum((zone_counts.get(z["id"], 0) - avg_fx) ** 2 for z in zones) / len(zones)
        std_dev = math.sqrt(variance)
        zone_bal = max(0, 100 - (std_dev * 18))
    else:
        zone_bal = 100

    # 3. Adjacency Conflicts (brand rule checks)
    # Check bounding box intersections between zones
    def get_bb(z):
        poly = z.get("polygon", [])
        if not poly:
            return {"minX": 0, "maxX": 0, "minZ": 0, "maxZ": 0}
        xs = [p[0] for p in poly]
        zs = [p[1] for p in poly]
        return {"minX": min(xs), "maxX": max(xs), "minZ": min(zs), "maxZ": max(zs)}

    def zones_are_adjacent(z1, z2):
        b1 = get_bb(z1)
        b2 = get_bb(z2)
        gap = 0.6
        return (b1["minX"] < b2["maxX"] + gap and b2["minX"] < b1["maxX"] + gap and
                b1["minZ"] < b2["maxZ"] + gap and b2["minZ"] < b1["maxZ"] + gap)

    adjacency_rules = [
        {"a": "high-jewelry", "b": "accessories", "severity": "flag"},
        {"a": "service", "b": "high-jewelry", "severity": "warn"},
        {"a": "entrance", "b": "vip", "severity": "warn"},
        {"a": "entrance", "b": "high-jewelry", "severity": "flag"},
        {"a": "watches", "b": "entrance", "severity": "warn"}
    ]

    conflicts = 0
    conflict_list = []
    for i in range(len(zones)):
        for j in range(i + 1, len(zones)):
            z1 = zones[i]
            z2 = zones[j]
            if zones_are_adjacent(z1, z2):
                for rule in adjacency_rules:
                    match = ((z1.get("kind") == rule["a"] and z2.get("kind") == rule["b"]) or
                             (z1.get("kind") == rule["b"] and z2.get("kind") == rule["a"]))
                    if match:
                        conflicts += 1
                        conflict_list.append({
                            "zoneA": z1["id"],
                            "zoneB": z2["id"],
                            "rule": f"{rule['a'].title()} next to {rule['b'].title()} violates brand guidelines.",
                            "severity": rule["severity"]
                        })

    adj_score = max(0, 100 - (conflicts * 25))

    # 4. Traffic Exposure (placing high value items in high traffic zones)
    # Zone traffic weight
    traffic_weights = {
        "entrance": 1.0, "fine-jewelry": 0.84, "watches": 0.72, "accessories": 0.66,
        "consultation": 0.3, "high-jewelry": 0.42, "service": 0.38, "vip": 0.16
    }
    
    exposure_sum = 0
    fixture_by_id = {f["id"]: f for f in fixtures}
    zone_by_id = {z["id"]: z for z in zones}

    total_slots = 0
    for skey, sstate in slots.items():
        if not sstate or not sstate.get("sku"):
            continue
        parts = skey.split("#")
        fid = parts[0]
        if fid in fixture_by_id:
            total_slots += 1
            f = fixture_by_id[fid]
            z = zone_by_id.get(f.get("zoneId"))
            if z:
                zkind = z.get("kind", "fine-jewelry")
                tw = traffic_weights.get(zkind, 0.5)
                # Premium items (high/exceptional) get a bonus if exposed
                excl = sstate.get("exclusivityTier", "standard")
                excl_mult = 1.5 if excl == "exceptional" else 1.2 if excl == "high" else 1.0
                exposure_sum += tw * excl_mult

    traffic_score = (exposure_sum / max(total_slots, 1)) * 100
    traffic_score = min(100, max(0, traffic_score * 1.1))

    # 5. Dwell Impact (Seating elements paired with display counters, private salon layout)
    seating_count = sum(1 for f in fixtures if f.get("templateId", "").startswith("seating-"))
    private_salon_seating = 0
    for f in fixtures:
        if f.get("templateId", "").startswith("seating-"):
            z = zone_by_id.get(f.get("zoneId"))
            if z and z.get("kind") in ("vip", "consultation"):
                private_salon_seating += 1

    dwell_score = (seating_count * 8) + (private_salon_seating * 15)
    dwell_score = min(100, dwell_score)

    # 6. Stock Coverage Risk (Slots with low/zero stock)
    low_stock_slots = 0
    filled_slots = 0
    for skey, sstate in slots.items():
        if sstate and sstate.get("sku"):
            filled_slots += 1
            if sstate.get("stockLevel", 100) < 20:
                low_stock_slots += 1
    
    stock_risk = 100
    if filled_slots > 0:
        stock_risk = 100 * (1 - (low_stock_slots / filled_slots))

    # 7. Category Visibility (Wall shelves vs Island displays, orientation)
    # Islands and round tables are highly visible 360-degree showcases.
    island_visibility = sum(25 for f in fixtures if "island" in f.get("templateId", ""))
    table_visibility = sum(20 for f in fixtures if "table" in f.get("templateId", ""))
    visibility_score = min(100, island_visibility + table_visibility + 30)

    # Combine metrics using VM default weights for standard scorecard
    weights = DEFAULT_WEIGHTS["vm"]
    composite_score = (
        (space_eff * weights["density"]) +
        (zone_bal * weights["density"]) +
        (adj_score * weights["adjacency"]) +
        (traffic_score * weights["traffic"]) +
        (dwell_score * weights["dwell"]) +
        (stock_risk * weights["stockRisk"]) +
        (visibility_score * weights["visibility"])
    ) / sum(weights.values())

    return {
        "score": float(composite_score),
        "breakdown": {
            "space_efficiency": float(space_eff),
            "zone_balance": float(zone_bal),
            "adjacency_conflicts": float(adj_score),
            "traffic_exposure": float(traffic_score),
            "dwell_potential": float(dwell_score),
            "stock_coverage_risk": float(stock_risk),
            "category_visibility": float(visibility_score)
        },
        "conflicts": conflict_list
    }

# --- Layout Diff Engine ---
def diff_scenarios(baseline_payload: dict, target_payload: dict) -> dict:
    base_fixtures = {f["id"]: f for f in baseline_payload.get("fixtures", [])}
    tgt_fixtures = {f["id"]: f for f in target_payload.get("fixtures", [])}
    
    added = []
    removed = []
    moved = []
    replaced = []
    
    for fid, f in tgt_fixtures.items():
        if fid not in base_fixtures:
            added.append(fid)
        else:
            bf = base_fixtures[fid]
            # Checked if moved or rotated
            moved_flag = (
                abs(f.get("x", 0) - bf.get("x", 0)) > 0.05 or
                abs(f.get("z", 0) - bf.get("z", 0)) > 0.05 or
                abs(f.get("rotationY", 0) - bf.get("rotationY", 0)) > 0.05
            )
            replaced_flag = f.get("templateId") != bf.get("templateId")
            
            if replaced_flag:
                replaced.append(fid)
            elif moved_flag:
                moved.append(fid)
                
    for fid in base_fixtures.keys():
        if fid not in tgt_fixtures:
            removed.append(fid)
            
    return {
        "added": added,
        "removed": removed,
        "moved": moved,
        "replaced": replaced
    }

# --- Presets recommendations generator ---
def get_preset_layout(store_id: str, preset_name: str, current_payload: dict) -> dict:
    import copy
    payload = copy.deepcopy(current_payload)
    fixtures = payload.get("fixtures", [])
    
    # Reset modifications based on presets
    if preset_name == "flagship_launch":
        # Keep physical showcases but ensure key areas have premium cases and campaign flags are active
        for f in fixtures:
            if "island" in f.get("templateId", ""):
                f["finish"] = "champagne-gold"
        
        # Merge campaign slots
        slots = payload.get("slots", {})
        if isinstance(slots, dict):
            for skey, sstate in slots.items():
                if sstate and sstate.get("sku"):
                    sstate["campaignFlag"] = True

    elif preset_name == "vip_appointment":
        # Warm, intimate consult environment. Add lounge items, set warmer CCT (2700K)
        # Find consultation zones and inject seating elements
        vip_zones = [z for z in payload.get("zones", []) if z.get("kind") in ("vip", "consultation")]
        for z in vip_zones:
            z["cct"] = 2700
            # Add a sofa inside the zone centroid
            poly = z.get("polygon", [])
            if poly:
                cx = sum(p[0] for p in poly) / len(poly)
                cz = sum(p[1] for p in poly) / len(poly)
                # Create sofa fixture
                sofa_id = f"fx-seating-sofa-curved-{str(uuid.uuid4())[:8]}"
                fixtures.append({
                    "id": sofa_id,
                    "templateId": "seating-sofa-curved",
                    "zoneId": z["id"],
                    "x": round(cx, 1),
                    "z": round(cz, 1),
                    "rotationY": 0.0,
                    "dims": {"width": 1.8, "depth": 0.8, "height": 0.75},
                    "finish": "champagne-gold",
                    "variationSeed": 12345
                })

    elif preset_name == "night_cocktail":
        # Removes heavy display tables near entrance to make space for reception, overrides lighting to low 2800K
        arrival_zones = [z for z in payload.get("zones", []) if z.get("kind") == "entrance"]
        # Delete fixtures in arrival
        if arrival_zones:
            az_id = arrival_zones[0]["id"]
            payload["fixtures"] = [f for f in fixtures if f.get("zoneId") != az_id]
            # Add round cocktail tables
            poly = arrival_zones[0].get("polygon", [])
            if poly:
                cx = sum(p[0] for p in poly) / len(poly)
                cz = sum(p[1] for p in poly) / len(poly)
                # Add table
                table_id = f"fx-display-table-round-{str(uuid.uuid4())[:8]}"
                payload["fixtures"].append({
                    "id": table_id,
                    "templateId": "display-table-round",
                    "zoneId": az_id,
                    "x": round(cx, 1),
                    "z": round(cz, 1),
                    "rotationY": 0.0,
                    "dims": {"width": 1.0, "depth": 1.0, "height": 1.1},
                    "finish": "champagne-gold",
                    "variationSeed": 54321
                })
        
        # Change lighting CCT in arrival and fine jewelry to dim evening level
        for z in payload.get("zones", []):
            if z.get("kind") in ("entrance", "fine-jewelry"):
                z["cct"] = 2800
                z["lightingPreset"] = "PRESET-LOUNGE-2700K-LOW"

    elif preset_name == "low_stock":
        # Re-arrange inventory to consolidate into fewer key showcases
        slots = payload.get("slots", {})
        if isinstance(slots, dict):
            # Find and empty slots in low-exposure zones, merge them to fine-jewelry showcases
            for skey, sstate in list(slots.items()):
                if sstate and sstate.get("sku"):
                    # Mock restocking
                    sstate["stockLevel"] = max(80, sstate.get("stockLevel", 100))

    payload["fixtures"] = fixtures
    # Re-calculate metrics for the preset
    payload["metrics"] = score_scenario(payload)
    return payload
