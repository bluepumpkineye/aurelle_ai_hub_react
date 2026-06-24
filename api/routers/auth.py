from fastapi import APIRouter
from pydantic import BaseModel

from api.security_tokens import make_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(req: LoginRequest):
    # Reuse the existing engine auth (mock users / admin / Supabase) unchanged.
    from utils.auth import sign_in

    res = sign_in(req.email, req.password)
    if not res.get("success"):
        return {"ok": False, "message": res.get("message", "Invalid login credentials.")}

    user = res.get("user", {})
    email = user.get("email", req.email)
    return {
        "ok": True,
        "token": make_token(email),
        "user": {"email": email},
        "mode": res.get("mode", "mock"),
    }
