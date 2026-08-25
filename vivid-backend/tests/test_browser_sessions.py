"""Ownership, quotas and egress rules — the tenancy boundary for partners."""
import pytest

from app.core.errors import APIError
from app.services import browser_sessions as bs

OWNER = "key_1"
OTHER = "key_2"
USER = "user_1"


async def _create(redis, owner=OWNER, domains=None, authenticated=False,
                  max_sessions=3):
    return await bs.create(redis, owner_id=owner, user_id=USER,
                           allowed_domains=domains, authenticated=authenticated,
                           idle_ttl=None, max_sessions=max_sessions)


# --- ownership --------------------------------------------------------------
async def test_owner_can_fetch_its_own_session(redis):
    record = await _create(redis)
    assert (await bs.get(redis, record.id, OWNER)).id == record.id


async def test_another_owner_cannot_touch_it(redis):
    """The tenancy hole this registry exists to close: session ids used to be
    caller-chosen strings in a flat namespace, so anyone could drive anyone
    else's browser — cookies and logged-in state included."""
    record = await _create(redis)
    with pytest.raises(APIError) as exc:
        await bs.get(redis, record.id, OTHER)
    # 404, not 403: a partner must not be able to probe which ids exist.
    assert exc.value.status == 404
    assert exc.value.code == "session_expired"


async def test_unknown_session_is_not_found(redis):
    with pytest.raises(APIError) as exc:
        await bs.get(redis, "bs_nope", OWNER)
    assert exc.value.code == "session_expired"


async def test_sessions_are_listed_per_owner(redis):
    a = await _create(redis, owner=OWNER)
    await _create(redis, owner=OTHER)
    mine = await bs.list_for_owner(redis, OWNER)
    assert [r.id for r in mine] == [a.id]


async def test_listing_prunes_sessions_that_expired(redis):
    record = await _create(redis)
    del redis.strings[bs._skey(record.id)]          # as if the TTL fired
    assert await bs.list_for_owner(redis, OWNER) == []
    assert redis.sets[bs._okey(OWNER)] == set()


# --- quotas -----------------------------------------------------------------
async def test_quota_refuses_rather_than_evicting(redis):
    """The browser pool used to close the least recently used session to make
    room. With partners sharing a tier that silently destroys another tenant's
    work, and an evicted authenticated session is a lost login."""
    for _ in range(2):
        await _create(redis, max_sessions=2)
    with pytest.raises(APIError) as exc:
        await _create(redis, max_sessions=2)
    assert exc.value.code == "quota_exceeded"
    assert exc.value.status == 429
    assert len(await bs.list_for_owner(redis, OWNER)) == 2   # nothing was lost


async def test_closing_frees_quota(redis):
    record = await _create(redis, max_sessions=1)
    await bs.close(redis, record.id, OWNER)
    assert (await _create(redis, max_sessions=1)) is not None


async def test_one_owners_quota_does_not_bind_another(redis):
    await _create(redis, owner=OWNER, max_sessions=1)
    assert (await _create(redis, owner=OTHER, max_sessions=1)) is not None


# --- registry availability --------------------------------------------------
async def test_registry_failure_is_closed_not_open(redis):
    """The rate limiter fails open; this must not. Without Redis we cannot
    prove who owns a session, and guessing hands one partner another's
    authenticated browser."""
    record = await _create(redis)
    redis.fail = True
    with pytest.raises(APIError) as exc:
        await bs.get(redis, record.id, OWNER)
    assert exc.value.status == 503


# --- egress -----------------------------------------------------------------
@pytest.mark.parametrize("url,allowed", [
    ("https://example.com/app", True),
    ("https://example.com", True),
    ("https://api.example.com/v1", True),        # subdomains are inside
    ("https://evil.com/steal", False),
    ("https://notexample.com", False),           # suffix, not a subdomain
    ("https://example.com.evil.com", False),     # the classic near-miss
    ("not a url", False),
])
async def test_domain_scoping(redis, url, allowed):
    record = await _create(redis, domains=["example.com"])
    assert bs.url_allowed(record, url) is allowed


async def test_off_domain_navigation_is_refused_with_a_code(redis):
    record = await _create(redis, domains=["example.com"])
    with pytest.raises(APIError) as exc:
        bs.assert_url_allowed(record, "https://evil.com")
    assert exc.value.code == "domain_not_allowed"
    assert exc.value.status == 403


async def test_no_domains_means_unrestricted(redis):
    record = await _create(redis)
    assert bs.url_allowed(record, "https://anywhere.example") is True


def test_domains_are_normalised():
    # A full URL is the obvious mistake; there is no reason to punish it.
    assert bs.normalise_domains(["https://Example.com/path", "*.foo.com",
                                 " bar.com:8443 ", "", "example.com"]) == \
        ["example.com", "foo.com", "bar.com"]


# --- snapshot identity ------------------------------------------------------
async def test_snapshot_id_round_trips(redis):
    record = await _create(redis)
    await bs.set_snapshot(redis, record, "snap_1")
    assert (await bs.get(redis, record.id, OWNER)).snapshot_id == "snap_1"
