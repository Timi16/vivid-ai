import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core import errors
from app.core.config import settings
from app.db.session import init_db
from app.services import storage
from app.services.models_gateway import http as gateway_http
from app.ws.handler import router as ws_router

log = logging.getLogger("vivid")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        app.state.arq = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    except Exception as e:
        log.warning("arq pool unavailable, background jobs disabled: %s", e)
        app.state.arq = None
    try:
        await storage.ensure_bucket()
    except Exception as e:
        log.warning("object storage unavailable: %s", e)
    yield
    await gateway_http.aclose()
    if app.state.arq is not None:
        await app.state.arq.aclose()
    await app.state.redis.aclose()


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION,
              lifespan=lifespan)

# One error shape for every route, plus a request id on every response.
errors.install(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[errors.REQUEST_ID_HEADER],
)

# REST is versioned from day one (spec section 6) so partner APIs can be added
# under the same scheme.
app.include_router(api_router, prefix="/v1")
app.include_router(ws_router)
