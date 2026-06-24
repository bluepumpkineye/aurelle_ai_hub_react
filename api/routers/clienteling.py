from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.security_tokens import require_auth
from api.services import clienteling as svc
from api.llm_stream import stream_chat

router = APIRouter(prefix="/api/clienteling", tags=["clienteling"])


class Filters(BaseModel):
    markets: list[str] = []
    segments: list[str] = []
    boutiques: list[str] = []


class LookupRequest(BaseModel):
    role: str
    client_id: str


class OutreachRequest(BaseModel):
    role: str
    client_id: str
    channel: str = "WeChat Message"
    language: str = "English"
    occasion: str = "Private High Jewellery Salon Invitation"


class RagRequest(BaseModel):
    query: str
    tone: str = "Executive Summary"
    market: str = "All APAC"
    k: int = 2


@router.get("/filters")
def filters(_=Depends(require_auth)):
    return svc.filter_options()


@router.post("/overview")
def overview(f: Filters, _=Depends(require_auth)):
    return svc.overview(f.markets, f.segments, f.boutiques)


@router.get("/rag-examples")
def rag_examples(_=Depends(require_auth)):
    return {"examples": svc.RAG_EXAMPLES}


@router.post("/rag-search")
def rag_search(req: RagRequest, _=Depends(require_auth)):
    return svc.rag_search(req.query, req.k)


@router.post("/rag-answer")
def rag_answer(req: RagRequest, _=Depends(require_auth)):
    """Streams the grounded Maison Strategy answer."""
    messages = svc.rag_messages(req.query, req.tone, req.market, req.k)

    def gen():
        for tok in stream_chat(messages, temperature=0.2, max_tokens=800):
            yield tok

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@router.get("/roles")
def roles(_=Depends(require_auth)):
    try:
        from governance_client import ROLES, DEFAULT_ROLE
        return {"roles": list(ROLES.keys()), "default": DEFAULT_ROLE}
    except Exception:
        labels = [
            "Clienteling Lead — APAC",
            "Regional Manager — APAC",
            "Merchandiser",
            "Marketing Analyst — APAC",
            "Clienteling Lead — Greater China",
            "Group Admin",
        ]
        return {"roles": labels, "default": labels[0]}


@router.post("/lookup")
def lookup(req: LookupRequest, _=Depends(require_auth)):
    profile, gov, ok, kind = svc.governed_profile(req.role, req.client_id)
    return {"ok": ok, "kind": kind, "profile": profile, "governance": gov}


@router.post("/outreach")
def outreach(req: OutreachRequest, _=Depends(require_auth)):
    """Streams the governed outreach draft token-by-token (text/plain)."""
    profile, _gov, ok, kind = svc.governed_profile(req.role, req.client_id)

    def gen():
        if kind != "profile" or not profile:
            yield ("This access level cannot draft individual outreach under the "
                   "current governance policy.")
            return
        messages = svc.outreach_messages(profile, req.channel, req.language, req.occasion)
        for token in stream_chat(messages, temperature=0.45, max_tokens=900):
            yield token

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")
