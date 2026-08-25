import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import (create_token_pair, decode_token, hash_password,
                               verify_password)
from app.db.models import User
from app.schemas.auth import (DecaneLoginRequest, LoginRequest, ProfileUpdate,
                              RefreshRequest, SignupRequest, TokenPairOut,
                              UserOut)
from app.services import decane

# Sentinel password hash for social-login accounts — it can never verify, so
# password login on these accounts always fails cleanly.
OAUTH_SENTINEL = "!oauth"

router = APIRouter(prefix="/auth", tags=["auth"])


def _pair(user: User) -> TokenPairOut:
    return TokenPairOut(**create_token_pair(user.id), user=user)


def _require_password_auth() -> None:
    """Passwords are a test-only path. In the product, people sign in with
    Google or an emailed code through Decane."""
    if not settings.ALLOW_PASSWORD_AUTH:
        raise HTTPException(status_code=404, detail="Password sign-in is disabled")


@router.post("/signup", response_model=TokenPairOut, status_code=201)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    _require_password_auth()
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
    _require_password_auth()
    user = (await db.execute(
        select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _pair(user)


@router.post("/decane", response_model=TokenPairOut)
async def decane_login(body: DecaneLoginRequest,
                       db: AsyncSession = Depends(get_db)):
    """Social sign-in via Decane Connect (Google etc.). The browser SDK hands
    us a Decane access token; we verify it offline (ES256, JWKS) and key the
    account on the stable `uid` claim — never on a client-supplied email,
    which would allow account takeover."""
    try:
        claims = decane.verify_access_token(body.access_token)
    except decane.DecaneAuthError as e:
        status = 503 if "not configured" in str(e) else 401
        raise HTTPException(status_code=status, detail=str(e))

    # Synthetic, deterministic identity per Decane user — the email column is
    # our unique key and Decane tokens carry no verified email.
    identity = f"decane_{claims['uid']}@users.vivid"
    user = (await db.execute(
        select(User).where(User.email == identity))).scalar_one_or_none()
    if user is None:
        user = User(email=identity, password_hash=OAUTH_SENTINEL)
        db.add(user)
    # Google's profile fills what the account doesn't have yet: a real name,
    # a photo, and the address to show (the account key stays synthetic).
    if body.name and not user.name:
        user.name = body.name.strip()
    if body.picture and not user.avatar_url:
        user.avatar_url = body.picture
    if body.email and not user.profile_email:
        user.profile_email = body.email.lower()
    await db.commit()
    return _pair(user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(body: ProfileUpdate, user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    user.name = body.name.strip()
    await db.commit()
    return user


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
