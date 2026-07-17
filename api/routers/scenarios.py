from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

from api.security_tokens import require_auth
from api.services import scenarios as svc
from api.llm_stream import stream_chat

router = APIRouter(tags=["scenarios"])

# --- Pydantic Request Models ---
class ScenarioCreate(BaseModel):
    store_id: str
    name: str
    description: str = ""
    payload: dict
    baseline_id: str = None

class ScenarioUpdate(BaseModel):
    name: str = None
    description: str = None
    payload: dict = None
    status: str = None
    approval_state: str = None
    notes: str = None

class VersionCreate(BaseModel):
    notes: str = ""

class WeightsSave(BaseModel):
    role: str
    weights: dict

class PresetRequest(BaseModel):
    store_id: str
    preset_name: str
    current_payload: dict

class ExplainRequest(BaseModel):
    baseline_metrics: dict
    target_metrics: dict
    diffs: dict

# --- Routes ---

@router.get("/api/scenarios")
def get_scenarios(store_id: str, _=Depends(require_auth)):
    try:
        return svc.list_scenarios(store_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/scenarios")
def create_scenario(body: ScenarioCreate, token=Depends(require_auth)):
    try:
        creator = token.get("email", "unknown")
        return svc.create_scenario(
            store_id=body.store_id,
            name=body.name,
            description=body.description,
            creator=creator,
            payload=body.payload,
            baseline_id=body.baseline_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/scenarios/{id}")
def get_scenario_details(id: str, _=Depends(require_auth)):
    scenario = svc.get_scenario(id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    # Deserialize JSON strings for frontend consumption
    res = dict(scenario)
    res["scenario_payload"] = json.loads(res["scenario_payload_json"])
    res["metric_payload"] = json.loads(res["metric_payload_json"]) if res["metric_payload_json"] else None
    return res

@router.put("/api/scenarios/{id}")
def update_scenario_data(id: str, body: ScenarioUpdate, token=Depends(require_auth)):
    try:
        user = token.get("email", "unknown")
        # Read existing first to fill missing fields
        existing = svc.get_scenario(id)
        if not existing:
            raise HTTPException(status_code=404, detail="Scenario not found")
        
        name = body.name if body.name is not None else existing["name"]
        description = body.description if body.description is not None else existing["description"]
        payload = body.payload if body.payload is not None else json.loads(existing["scenario_payload_json"])
        notes = body.notes if body.notes is not None else existing["notes"]
        
        return svc.update_scenario(
            scenario_id=id,
            name=name,
            description=description,
            payload=payload,
            user=user,
            status=body.status,
            approval_state=body.approval_state,
            notes=notes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/scenarios/{id}")
def delete_scenario_data(id: str, token=Depends(require_auth)):
    try:
        user = token.get("email", "unknown")
        svc.delete_scenario(id, user)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/scenarios/{id}/duplicate")
def duplicate_scenario_data(id: str, body: dict, token=Depends(require_auth)):
    try:
        user = token.get("email", "unknown")
        name = body.get("name", "Duplicate Scenario")
        return svc.duplicate_scenario(id, name, user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Versioning ---

@router.post("/api/scenarios/{id}/versions")
def save_scenario_version(id: str, body: VersionCreate, token=Depends(require_auth)):
    try:
        user = token.get("email", "unknown")
        return svc.create_version(id, user, body.notes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/scenarios/{id}/versions")
def list_scenario_versions(id: str, _=Depends(require_auth)):
    try:
        return svc.list_versions(id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/scenarios/{id}/restore")
def restore_scenario_version(id: str, body: dict, token=Depends(require_auth)):
    try:
        user = token.get("email", "unknown")
        ver_num = body.get("version_number")
        if ver_num is None:
            raise HTTPException(status_code=400, detail="version_number is required")
        return svc.restore_version(id, int(ver_num), user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Weights ---

@router.get("/api/scenarios/weights")
def get_role_weights(_=Depends(require_auth)):
    return svc.get_weights()

@router.post("/api/scenarios/weights")
def update_role_weights(body: WeightsSave, _=Depends(require_auth)):
    try:
        svc.save_weights(body.role, body.weights)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Presets ---

@router.post("/api/scenarios/preset")
def get_scenario_preset(body: PresetRequest, _=Depends(require_auth)):
    try:
        return svc.get_preset_layout(body.store_id, body.preset_name, body.current_payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Explainability ---

@router.post("/api/scenarios/explain")
def explain_scenario_diff(body: ExplainRequest, _=Depends(require_auth)):
    prompt = f"""You are Aurelle's Lead Visual Merchandiser. Analyze the difference between two store layout scenarios:
  
Baseline Scenario Metrics:
{json.dumps(body.baseline_metrics, indent=2)}

Proposed Scenario Metrics:
{json.dumps(body.target_metrics, indent=2)}

Fixture Differences (Added, Removed, Moved, Replaced):
{json.dumps(body.diffs, indent=2)}

Write a professional, detailed and concise commercial review (under 250 words) comparing the layouts.
Explain why the proposed scenario scored higher or lower in specific metrics (like Traffic Exposure, Space Efficiency, Adjacency conflicts, and Dwell Potential).
Conclude with 2 specific, actionable visual merchandising recommendations to optimize brand visibility, circulation paths, or inventory risk.
Keep the tone premium, authoritative, and focused on luxury boutique layout standards.
"""
    try:
        def stream_gen():
            for chunk in stream_chat([{"role": "user", "content": prompt}], temperature=0.3):
                yield chunk
        return StreamingResponse(stream_gen(), media_type="text/plain; charset=utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
