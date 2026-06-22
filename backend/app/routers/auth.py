"""
Email + password auth (Phase 7).

Active only when AUTH_ENABLED=true. The first account to register adopts any
existing single-user (`local-user`) comics, so turning on multi-user doesn't
strand the work you made in local mode.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from .. import config, db, security
from ..deps import get_current_user
from ..util import new_id, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str


def _public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u.get("email"),
        "name": u.get("name"),
        "role": u.get("role", "user"),
    }


async def _create_session(user_id: str) -> str:
    token = security.new_session_token()
    await db.col("user_sessions").insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(days=config.SESSION_TTL_DAYS),
        }
    )
    return token


@router.post("/register")
async def register(body: RegisterBody):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if await db.users_col().find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user_id = new_id("usr")
    is_first_real_user = await db.users_col().count_documents({"password_hash": {"$exists": True}}) == 0
    doc = {
        "user_id": user_id,
        "email": email,
        "name": (body.name or email.split("@")[0]).strip(),
        "password_hash": security.hash_password(body.password),
        "role": "user",
        "created_at": utcnow(),
    }
    await db.users_col().insert_one(doc)

    # First real account inherits any local-mode comics.
    if is_first_real_user:
        await db.series_col().update_many(
            {"owner_id": config.DEFAULT_USER_ID}, {"$set": {"owner_id": user_id}}
        )

    token = await _create_session(user_id)
    return {"session_token": token, "user": _public_user(doc)}


@router.post("/login")
async def login(body: LoginBody):
    email = body.email.strip().lower()
    user = await db.users_col().find_one({"email": email})
    if not user or not security.verify_password(body.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await _create_session(user["user_id"])
    return {"session_token": token, "user": _public_user(user)}


@router.post("/logout")
async def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.col("user_sessions").delete_one({"session_token": token})
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"user": _public_user(user)}
