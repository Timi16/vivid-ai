import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import (create_token_pair, decode_token, hash_password,
                               verify_password)
from app.db.models import User
from app.schemas.auth import (LoginRequest, RefreshRequest, SignupRequest,
                              TokenPairOut)

router = APIRouter(prefix="/auth", tags=["auth"])


def _pair(user: User) -> TokenPairOut:
    return TokenPairOut(**create_token_pair(user.id), user=user)


@router.post("/signup", response_model=TokenPairOut, status_code=201)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    existing = (await db.execute(
        select(User).where(User.email == email))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    await db.commit()
    return _pair(user)


@router.post("/login", response_model=TokenPairOut)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _pair(user)


@router.post("/refresh", response_model=TokenPairOut)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        user_id = decode_token(body.refresh_token, "refresh")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user")
    return _pair(user)
