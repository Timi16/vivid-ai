"""Per-user limits backed by Redis: a requests-per-minute window and a single
concurrent generation (spec 3.9). Redis being down never blocks chat — limits
fail open."""
import time

from app.core.config import settings

GENERATION_LOCK_TTL = 180  # seconds; safety net if a release is ever missed


async def check_bucket(redis, bucket: str, limit: int) -> bool:
    """One fixed one-minute window. `bucket` namespaces the counter, so two
    kinds of traffic from the same person are limited separately."""
    try:
        key = f"{bucket}:{int(time.time() // 60)}"
        n = await redis.incr(key)
        if n == 1:
            await redis.expire(key, 90)
        return n <= limit
    except Exception:
        return True


async def check_request(redis, user_id: str) -> bool:
    return await check_bucket(redis, f"rl:{user_id}",
                              settings.RATE_LIMIT_PER_MINUTE)


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
