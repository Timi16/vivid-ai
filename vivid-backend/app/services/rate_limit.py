"""Per-user limits backed by Redis: a requests-per-minute window and a single
concurrent generation (spec 3.9). Redis being down never blocks chat — limits
fail open."""
import time

from app.core.config import settings

GENERATION_LOCK_TTL = 180  # seconds; safety net if a release is ever missed


async def check_request(redis, user_id: str) -> bool:
    try:
        key = f"rl:{user_id}:{int(time.time() // 60)}"
        n = await redis.incr(key)
        if n == 1:
            await redis.expire(key, 90)
        return n <= settings.RATE_LIMIT_PER_MINUTE
    except Exception:
        return True


async def acquire_generation(redis, user_id: str) -> bool:
    try:
        return bool(await redis.set(f"gen:{user_id}", "1", nx=True, ex=GENERATION_LOCK_TTL))
    except Exception:
        return True


async def release_generation(redis, user_id: str) -> None:
    try:
        await redis.delete(f"gen:{user_id}")
    except Exception:
        pass
