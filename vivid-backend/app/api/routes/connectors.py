from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.db.models import Connector, User
from app.services.connectors import PROVIDERS

router = APIRouter(prefix="/connectors", tags=["connectors"])


class ConnectorCreate(BaseModel):
    provider: str
    token: str = ""  # personal access token; empty = public mode
    username: str | None = Field(default=None, max_length=100)
    name: str | None = Field(default=None, max_length=128)


class ConnectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    name: str
    mode: str = "public"
    created_at: datetime


def _out(c: Connector) -> ConnectorOut:
    out = ConnectorOut.model_validate(c)
    out.mode = (c.config_json or {}).get("mode", "authenticated" if c.token else "public")
    return out


@router.get("", response_model=list[ConnectorOut])
async def list_connectors(user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    rows = await db.execute(select(Connector).where(Connector.user_id == user.id))
    return [_out(c) for c in rows.scalars()]


@router.post("", response_model=ConnectorOut, status_code=201)
async def add_connector(body: ConnectorCreate,
                        user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    provider = PROVIDERS.get(body.provider)
    if provider is None:
        raise HTTPException(status_code=400,
                            detail=f"unknown provider; available: {sorted(PROVIDERS)}")
    try:
        info = await provider.verify(body.token, {"username": body.username})
    except Exception as e:
        raise HTTPException(status_code=422,
                            detail=f"could not verify {body.provider} credentials: {e}")

    existing = (await db.execute(
        select(Connector).where(Connector.user_id == user.id,
                                Connector.provider == body.provider)
    )).scalar_one_or_none()
    name = body.name or f"{body.provider} ({info['login']})"
    if existing is not None:
        existing.token = body.token
        existing.config_json = info["config"]
        existing.name = name
        await db.commit()
        return _out(existing)
    connector = Connector(user_id=user.id, provider=body.provider,
                          token=body.token, name=name,
                          config_json=info["config"])
    db.add(connector)
    await db.commit()
    return _out(connector)


@router.delete("/{connector_id}", status_code=204)
async def delete_connector(connector_id: str,
                           user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_db)):
    c = await db.get(Connector, connector_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connector not found")
    await db.delete(c)
    await db.commit()


@router.post("/{connector_id}/test")
async def test_connector(connector_id: str,
                         user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    c = await db.get(Connector, connector_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connector not found")
    provider = PROVIDERS[c.provider]
    try:
        info = await provider.verify(c.token, c.config_json or {})
        return {"ok": True, "account": info["login"], "mode": info["mode"]}
    except Exception as e:
        return {"ok": False, "error": str(e)}
