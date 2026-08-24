import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .browser.pool import pool
from .routers import browse, health

logging.basicConfig(level=logging.INFO, force=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await pool.start()
    logging.getLogger("vivid.tools").info("browser pool ready")
    yield
    await pool.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Vivid Tools", version="0.1.0", lifespan=lifespan)
    app.include_router(health.router)
    app.include_router(browse.router)
    return app


app = create_app()
