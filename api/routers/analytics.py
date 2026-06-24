from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.security_tokens import require_auth
from api.llm_stream import stream_chat
from api.services import executive as exec_svc
from api.services import product as prod_svc
from api.services import boutique as bt_svc
from api.services import supply as sup_svc
from api.services import marketing as mkt_svc
from api.services import llmops as ops_svc

router = APIRouter(tags=["analytics"])


def _stream(messages, max_tokens=900, temperature=0.35):
    def gen():
        for tok in stream_chat(messages, temperature=temperature, max_tokens=max_tokens):
            yield tok
    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


# ── Executive Dashboard ────────────────────────────────────────
@router.get("/api/executive/overview")
def executive_overview(_=Depends(require_auth)):
    return exec_svc.overview()


@router.post("/api/executive/report")
def executive_report(_=Depends(require_auth)):
    return _stream(exec_svc.report_messages(), max_tokens=600)


# ── Product Performance ────────────────────────────────────────
class ProductFilters(BaseModel):
    markets: list[str] = []
    channels: list[str] = []
    categories: list[str] = []


@router.get("/api/product/filters")
def product_filters(_=Depends(require_auth)):
    return prod_svc.filter_options()


@router.post("/api/product/overview")
def product_overview(f: ProductFilters, _=Depends(require_auth)):
    return prod_svc.overview(f.markets, f.channels, f.categories)


@router.post("/api/product/report")
def product_report(f: ProductFilters, _=Depends(require_auth)):
    return _stream(prod_svc.report_messages(f.markets, f.channels, f.categories))


# ── Boutique Analytics ─────────────────────────────────────────
class BoutiqueFilters(BaseModel):
    markets: list[str] = []
    tiers: list[str] = []


@router.get("/api/boutique/filters")
def boutique_filters(_=Depends(require_auth)):
    return bt_svc.filter_options()


@router.post("/api/boutique/overview")
def boutique_overview(f: BoutiqueFilters, _=Depends(require_auth)):
    return bt_svc.overview(f.markets, f.tiers)


@router.post("/api/boutique/report")
def boutique_report(f: BoutiqueFilters, _=Depends(require_auth)):
    return _stream(bt_svc.report_messages(f.markets, f.tiers))


# ── Demand & Supply Planning ───────────────────────────────────
class SupplyFilters(BaseModel):
    category: str = "All"
    market: str = "All"
    risks: list[str] = ["High", "Medium", "Low"]


class AllocReq(BaseModel):
    product: str
    total_units: int = 120
    w_wait: float = 0.45
    w_vel: float = 0.30
    w_tier: float = 0.15
    w_cover: float = 0.10


@router.get("/api/supply/filters")
def supply_filters(_=Depends(require_auth)):
    return sup_svc.filter_options()


@router.post("/api/supply/overview")
def supply_overview(f: SupplyFilters, _=Depends(require_auth)):
    return sup_svc.overview(f.category, f.market, f.risks)


@router.post("/api/supply/allocate")
def supply_allocate(r: AllocReq, _=Depends(require_auth)):
    return sup_svc.allocate(r.product, r.total_units, r.w_wait, r.w_vel, r.w_tier, r.w_cover)


@router.post("/api/supply/report")
def supply_report(f: SupplyFilters, _=Depends(require_auth)):
    return _stream(sup_svc.report_messages(f.category, f.market, f.risks), temperature=0.3)


@router.post("/api/supply/allocation-report")
def supply_alloc_report(r: AllocReq, _=Depends(require_auth)):
    alloc = sup_svc.allocate(r.product, r.total_units, r.w_wait, r.w_vel, r.w_tier, r.w_cover)
    weights = {"w_wait": r.w_wait, "w_vel": r.w_vel, "w_tier": r.w_tier, "w_cover": r.w_cover}
    return _stream(sup_svc.allocation_report_messages(r.product, weights, alloc["records"]), temperature=0.4)


# ── Model Stock ───────────────────────────────────────────────
class ModelStockFilters(BaseModel):
    as_of_date: str
    markets: list[str] = []
    boutiques: list[str] = []
    category: str = "All"
    collections: list[str] = []
    tier: str = "All"
    show_only: str = "All"


@router.get("/api/supply/model-stock/filters")
def supply_model_stock_filters(_=Depends(require_auth)):
    return sup_svc.model_stock_filters()


@router.post("/api/supply/model-stock/overview")
def supply_model_stock_overview(f: ModelStockFilters, _=Depends(require_auth)):
    return sup_svc.model_stock_overview(f.dict())


@router.post("/api/supply/model-stock/report")
def supply_model_stock_report(f: ModelStockFilters, _=Depends(require_auth)):
    return _stream(sup_svc.model_stock_report_messages(f.dict()), temperature=0.4)


# ── Planning & Forecast ───────────────────────────────────────
class ForecastFilters(BaseModel):
    market: str = "All APAC"
    category: str = "Watches"
    collections: list[str] = []
    skus: list[str] = []
    horizon: int = 90
    seasonality: bool = True
    include_inbound: bool = True


class ReallocScenarioReq(BaseModel):
    from_market: str
    to_market: str
    units: int
    lead_days: int
    skus: list[str]
    horizon: int = 90
    seasonality: bool = True


@router.get("/api/supply/forecast/filters")
def supply_forecast_filters(_=Depends(require_auth)):
    return sup_svc.forecast_filters()


@router.post("/api/supply/forecast/overview")
def supply_forecast_overview(f: ForecastFilters, _=Depends(require_auth)):
    return sup_svc.forecast_overview(f.dict())


@router.post("/api/supply/forecast/scenario")
def supply_forecast_scenario(r: ReallocScenarioReq, _=Depends(require_auth)):
    return sup_svc.forecast_scenario(r.dict())


@router.post("/api/supply/forecast/report")
def supply_forecast_report(f: ForecastFilters, _=Depends(require_auth)):
    return _stream(sup_svc.forecast_report_messages(f.dict()), temperature=0.35)



# ── Marketing Intelligence ─────────────────────────────────────
class MarketingFilters(BaseModel):
    markets: list[str] = []
    quarters: list[str] = []
    statuses: list[str] = []


@router.get("/api/marketing/filters")
def marketing_filters(_=Depends(require_auth)):
    return mkt_svc.filter_options()


@router.post("/api/marketing/overview")
def marketing_overview(f: MarketingFilters, _=Depends(require_auth)):
    return mkt_svc.overview(f.markets, f.quarters, f.statuses)


@router.post("/api/marketing/report")
def marketing_report(f: MarketingFilters, _=Depends(require_auth)):
    return _stream(mkt_svc.report_messages(f.markets, f.quarters, f.statuses), temperature=0.3)


# ── LLMOps & Prompt Lab ────────────────────────────────────────
class PromptRun(BaseModel):
    system: str = ""
    user: str = ""
    temperature: float = 0.4
    max_tokens: int = 512


@router.get("/api/llmops/monitor")
def llmops_monitor(_=Depends(require_auth)):
    return ops_svc.monitor()


@router.get("/api/llmops/templates")
def llmops_templates(_=Depends(require_auth)):
    return ops_svc.templates()


@router.post("/api/llmops/run")
def llmops_run(r: PromptRun, _=Depends(require_auth)):
    messages = [
        {"role": "system", "content": r.system or "You are a helpful Aurelle assistant."},
        {"role": "user", "content": r.user or "Please execute the above instructions."},
    ]
    return _stream(messages, max_tokens=r.max_tokens, temperature=r.temperature)


# ── Module System Prompts (view / customise / test) ────────────
class PromptSave(BaseModel):
    key: str
    text: str


class PromptTest(BaseModel):
    text: str
    sample: str = ""


_PROMPT_META = {
    "morning_brief": "Executive Dashboard · Morning Brief",
    "vip_outreach": "Clienteling · VIP Outreach",
    "rag_assistant": "Clienteling · Maison Strategy (RAG)",
    "merchandising_advisor": "Product Performance",
    "boutique_insight": "Boutique Analytics",
    "allocation_advisor": "Demand & Supply · Allocation",
    "supply_chain_report": "Demand & Supply · Supply Chain",
    "marketing_intelligence": "Marketing Intelligence",
}


@router.get("/api/llmops/prompts")
def llmops_prompts(_=Depends(require_auth)):
    from utils.prompts import load_prompts
    prompts = load_prompts()
    try:
        from utils.prompts import DEFAULT_PROMPTS
        defaults = DEFAULT_PROMPTS
    except Exception:
        defaults = {}
    return {
        "prompts": [
            {"key": k, "label": _PROMPT_META.get(k, k), "text": str(v),
             "customised": str(v) != str(defaults.get(k, v))}
            for k, v in prompts.items()
        ]
    }


@router.post("/api/llmops/prompts/save")
def llmops_prompts_save(r: PromptSave, _=Depends(require_auth)):
    from utils.prompts import load_prompts, save_prompts
    prompts = load_prompts()
    prompts[r.key] = r.text
    save_prompts({k: v for k, v in prompts.items()})
    return {"ok": True}


@router.post("/api/llmops/prompts/reset")
def llmops_prompts_reset(r: PromptSave, _=Depends(require_auth)):
    # Remove the custom override so the default takes effect again.
    import json
    import os
    from utils.prompts import PROMPTS_FILE, DEFAULT_PROMPTS
    custom = {}
    if os.path.exists(PROMPTS_FILE):
        try:
            with open(PROMPTS_FILE, encoding="utf-8") as f:
                custom = json.load(f)
        except Exception:
            custom = {}
    custom.pop(r.key, None)
    try:
        with open(PROMPTS_FILE, "w", encoding="utf-8") as f:
            json.dump(custom, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
    return {"ok": True, "text": str(DEFAULT_PROMPTS.get(r.key, ""))}


@router.post("/api/llmops/prompts/test")
def llmops_prompts_test(r: PromptTest, _=Depends(require_auth)):
    messages = [
        {"role": "system", "content": r.text},
        {"role": "user", "content": r.sample or "Provide a brief example response that demonstrates this system prompt in action."},
    ]
    return _stream(messages, max_tokens=400, temperature=0.4)
