import unittest
import json
import os
from pathlib import Path

# Override DB_PATH for tests before importing scenarios service
from api.services import scenarios as svc

class TestScenarioPlanning(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Override DB_PATH to separate test database
        cls.orig_db_path = svc.DB_PATH
        svc.DB_PATH = Path(__file__).resolve().parent / "test_scenarios.db"
        svc.init_db()

    @classmethod
    def tearDownClass(cls):
        # Restore DB path and clean up test database
        if svc.DB_PATH.exists():
            try:
                os.remove(str(svc.DB_PATH))
            except Exception:
                pass
        svc.DB_PATH = cls.orig_db_path

    def setUp(self):
        # Clear database to ensure test isolation
        with svc.get_db() as conn:
            conn.execute("DELETE FROM scenarios")
            conn.execute("DELETE FROM scenario_versions")
            conn.execute("DELETE FROM scenario_changelog")
            conn.commit()

        # Create a mock layout payload
        self.mock_payload = {
            "floor": {"width": 20, "depth": 16},
            "zones": [
                {"id": "zone-arrival", "kind": "entrance", "polygon": [[-10, 5], [10, 5], [10, 8], [-10, 8]], "expectedAssortment": {"fragrance": 2}},
                {"id": "zone-fine", "kind": "fine-jewelry", "polygon": [[-10, 0], [10, 0], [10, 5], [-10, 5]], "expectedAssortment": {"rings": 4}},
                {"id": "zone-vip", "kind": "vip", "polygon": [[-10, -5], [10, -5], [10, 0], [-10, 0]], "expectedAssortment": {"rings": 2}}
            ],
            "fixtures": [
                {"id": "fx-table-1", "templateId": "display-table-round", "zoneId": "zone-arrival", "x": -4.0, "z": 6.5, "rotationY": 0.0, "finish": "champagne-gold"},
                {"id": "fx-island-1", "templateId": "showcase-island-180", "zoneId": "zone-fine", "x": 0.0, "z": 2.5, "rotationY": 0.0, "finish": "champagne-gold"}
            ],
            "slots": {
                "fx-island-1#0,0,0": {"sku": "ring-1", "stockLevel": 85, "campaignFlag": True, "exclusivityTier": "high"},
                "fx-table-1#0,0,0": {"sku": "frag-1", "stockLevel": 15, "campaignFlag": False, "exclusivityTier": "standard"}
            }
        }

    def test_init_db(self):
        self.assertTrue(svc.DB_PATH.exists())

    def test_scoring_engine(self):
        metrics = svc.score_scenario(self.mock_payload)
        self.assertIn("score", metrics)
        self.assertIn("breakdown", metrics)
        self.assertGreaterEqual(metrics["score"], 0)
        self.assertLessEqual(metrics["score"], 100)
        
        # Test low stock impact on stock risk score
        breakdown = metrics["breakdown"]
        self.assertLess(breakdown["stock_coverage_risk"], 100.0) # due to frag-1 stockLevel = 15 (< 20)

    def test_crud_operations(self):
        # Create
        scen = svc.create_scenario("test-store", "Holiday Concept", "Flagship Maison layout", "vm@aurelle.com", self.mock_payload)
        scen_id = scen["id"]
        self.assertEqual(scen["name"], "Holiday Concept")
        
        # List
        lst = svc.list_scenarios("test-store")
        self.assertEqual(len(lst), 1)
        self.assertEqual(lst[0]["id"], scen_id)

        # Get
        fetched = svc.get_scenario(scen_id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["name"], "Holiday Concept")

        # Update
        updated_payload = self.mock_payload.copy()
        updated_payload["fixtures"].append({
            "id": "fx-pedestal-1", "templateId": "pedestal-solo", "zoneId": "zone-fine", "x": 3.0, "z": 2.5, "rotationY": 0.0, "finish": "champagne-gold"
        })
        svc.update_scenario(scen_id, "Holiday Concept v2", "Updated description", updated_payload, "vm@aurelle.com")
        
        fetched = svc.get_scenario(scen_id)
        self.assertEqual(fetched["name"], "Holiday Concept v2")
        self.assertEqual(fetched["description"], "Updated description")
        
        # Duplicate
        duplicated = svc.duplicate_scenario(scen_id, "Holiday Concept v2 Copy", "vm@aurelle.com")
        self.assertEqual(duplicated["name"], "Holiday Concept v2 Copy")
        
        # Delete
        svc.delete_scenario(duplicated["id"], "vm@aurelle.com")
        self.assertIsNone(svc.get_scenario(duplicated["id"]))

    def test_version_control(self):
        scen = svc.create_scenario("test-store-ver", "Baseline Plan", "Base Plan", "vm@aurelle.com", self.mock_payload)
        scen_id = scen["id"]
        
        # Save version snapshot
        ver = svc.create_version(scen_id, "vm@aurelle.com", "Saved backup")
        self.assertEqual(ver["version_number"], 2) # creation automatically makes version 1

        # Modify layout
        modified_payload = self.mock_payload.copy()
        modified_payload["fixtures"] = []
        svc.update_scenario(scen_id, "Empty Layout", "Clear", modified_payload, "vm@aurelle.com")
        
        # Restore version 1
        restored = svc.restore_version(scen_id, 1, "vm@aurelle.com")
        self.assertEqual(len(restored["scenario_payload"]["fixtures"]), 2)

    def test_diff_engine(self):
        modified_payload = {
            "fixtures": [
                # fx-table-1 moved from x=-4.0 to x=-2.0
                {"id": "fx-table-1", "templateId": "display-table-round", "zoneId": "zone-arrival", "x": -2.0, "z": 6.5, "rotationY": 0.0, "finish": "champagne-gold"},
                # fx-island-1 replaced type showcase-island-180 with showcase-island-120
                {"id": "fx-island-1", "templateId": "showcase-island-120", "zoneId": "zone-fine", "x": 0.0, "z": 2.5, "rotationY": 0.0, "finish": "champagne-gold"},
                # fx-pedestal-1 added
                {"id": "fx-pedestal-1", "templateId": "pedestal-solo", "zoneId": "zone-fine", "x": 3.0, "z": 2.5, "rotationY": 0.0, "finish": "champagne-gold"}
            ]
        }
        diff = svc.diff_scenarios(self.mock_payload, modified_payload)
        self.assertIn("fx-pedestal-1", diff["added"])
        self.assertIn("fx-table-1", diff["moved"])
        self.assertIn("fx-island-1", diff["replaced"])
        
    def test_presets(self):
        preset = svc.get_preset_layout("hk-princes", "vip_appointment", self.mock_payload)
        self.assertEqual(len(preset["fixtures"]), 3) # original 2 + 1 seating-sofa-curved added by preset

if __name__ == "__main__":
    unittest.main()
