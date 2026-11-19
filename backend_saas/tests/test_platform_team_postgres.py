"""Platform team management against a disposable loopback PostgreSQL database.

Run: REVIEW_POSTGRES_PORT=55443 python -m pytest tests/test_platform_team_postgres.py -q
Skipped without REVIEW_POSTGRES_PORT (CI sets it). Never reads DATABASE_URL;
only synthetic users in the throwaway database from test_review_postgres.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

from app.repositories import platform_roles

from .test_review_postgres import local_database, real_db  # noqa: F401 - pytest fixtures


@pytest.fixture
def team(real_db):  # noqa: F811
    cursor, tenant, _ = real_db
    owner_a, owner_b, plain, org_admin = (str(uuid4()) for _ in range(4))
    with cursor() as cur:
        # The throwaway database is shared per module: start every test clean.
        cur.execute("DELETE FROM platform_owners")
        cur.execute("DELETE FROM audit_log WHERE action LIKE 'platform.owner_%%'")
        for user in (owner_a, owner_b, plain, org_admin):
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s), (%s)", (owner_a, owner_b))
        cur.execute(
            "INSERT INTO organization_members(user_id, organization_id) VALUES (%s, %s), (%s, %s)",
            (owner_b, tenant.organization_id, org_admin, tenant.organization_id),
        )
    return cursor, tenant, owner_a, owner_b, plain, org_admin


def _owners(cursor) -> set[str]:
    with cursor() as cur:
        cur.execute("SELECT user_id::text AS user_id FROM platform_owners")
        return {row["user_id"] for row in cur.fetchall()}


def _audit(cursor, action: str) -> list[dict]:
    with cursor() as cur:
        cur.execute(
            "SELECT actor_user_id::text AS actor, action, target_type, target_id, organization_id, metadata "
            "FROM audit_log WHERE action = %s",
            (action,),
        )
        return cur.fetchall()


def test_list_shows_owners_with_their_club_roles(team):
    cursor, tenant, owner_a, owner_b, *_ = team
    rows = {row["user_id"]: row for row in platform_roles.list_platform_owners()}
    assert set(rows) == {owner_a, owner_b}
    assert rows[owner_a]["organizations"] == []
    assert rows[owner_b]["organizations"] == [{"slug": tenant.slug, "name": tenant.name}]


def test_grant_writes_role_and_audit_in_one_step(team):
    cursor, _, owner_a, owner_b, plain, org_admin = team
    assert platform_roles.grant_platform_owner(
        user_id=plain, actor_user_id=owner_a, actor_email="a@example.test", target_email="p@example.test"
    ) is True
    assert _owners(cursor) == {owner_a, owner_b, plain}
    [entry] = _audit(cursor, "platform.owner_granted")
    assert entry["actor"] == owner_a and entry["target_id"] == plain
    assert entry["target_type"] == "platform_owner" and entry["organization_id"] is None
    assert entry["metadata"] == {"email": "p@example.test"}


def test_grant_twice_is_noop_without_second_audit_entry(team):
    cursor, _, owner_a, _, plain, _ = team
    kwargs = dict(user_id=plain, actor_user_id=owner_a, actor_email=None, target_email=None)
    assert platform_roles.grant_platform_owner(**kwargs) is True
    assert platform_roles.grant_platform_owner(**kwargs) is False
    assert len(_audit(cursor, "platform.owner_granted")) == 1


def test_grant_keeps_existing_club_membership(team):
    cursor, tenant, owner_a, _, _, org_admin = team
    platform_roles.grant_platform_owner(user_id=org_admin, actor_user_id=owner_a, actor_email=None, target_email=None)
    is_owner, org_ids = platform_roles.get_user_roles(org_admin)
    assert is_owner is True
    assert org_ids == [str(tenant.organization_id)]


def test_revoke_removes_only_platform_role(team):
    cursor, tenant, owner_a, owner_b, *_ = team
    assert platform_roles.revoke_platform_owner(
        user_id=owner_b, actor_user_id=owner_a, actor_email="a@example.test", target_email="b@example.test"
    ) is True
    assert _owners(cursor) == {owner_a}
    is_owner, org_ids = platform_roles.get_user_roles(owner_b)
    assert is_owner is False
    assert org_ids == [str(tenant.organization_id)]  # club role untouched
    [entry] = _audit(cursor, "platform.owner_revoked")
    assert entry["target_id"] == owner_b and entry["metadata"] == {"email": "b@example.test"}


def test_revoke_non_owner_returns_false_and_logs_nothing(team):
    cursor, _, owner_a, owner_b, plain, _ = team
    assert platform_roles.revoke_platform_owner(
        user_id=plain, actor_user_id=owner_a, actor_email=None, target_email=None
    ) is False
    assert _owners(cursor) == {owner_a, owner_b}
    assert _audit(cursor, "platform.owner_revoked") == []


def test_last_owner_cannot_be_revoked_not_even_by_self(team):
    cursor, _, owner_a, owner_b, *_ = team
    platform_roles.revoke_platform_owner(user_id=owner_b, actor_user_id=owner_a, actor_email=None, target_email=None)
    with pytest.raises(platform_roles.LastPlatformOwnerError):
        platform_roles.revoke_platform_owner(user_id=owner_a, actor_user_id=owner_a, actor_email=None, target_email=None)
    assert _owners(cursor) == {owner_a}
    assert len(_audit(cursor, "platform.owner_revoked")) == 1


def test_concurrent_revokes_never_leave_zero_owners(team):
    cursor, _, owner_a, owner_b, *_ = team
    barrier = Barrier(2)

    def revoke(target, actor):
        barrier.wait()
        try:
            return platform_roles.revoke_platform_owner(
                user_id=target, actor_user_id=actor, actor_email=None, target_email=None
            )
        except (platform_roles.LastPlatformOwnerError, platform_roles.ActorNotPlatformOwnerError):
            return "refused"

    for _ in range(5):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(map(str, pool.map(revoke, (owner_a, owner_b), (owner_b, owner_a))))
        assert results == ["True", "refused"]
        assert len(_owners(cursor)) == 1
        # restore both owners for the next round
        with cursor() as cur:
            cur.execute(
                "INSERT INTO platform_owners(user_id) VALUES (%s), (%s) ON CONFLICT DO NOTHING", (owner_a, owner_b)
            )


def test_revoked_actor_can_neither_grant_nor_revoke(team):
    cursor, _, owner_a, owner_b, plain, _ = team
    third = str(uuid4())
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (third,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (third,))
    platform_roles.revoke_platform_owner(user_id=owner_b, actor_user_id=owner_a, actor_email=None, target_email=None)
    with pytest.raises(platform_roles.ActorNotPlatformOwnerError):
        platform_roles.grant_platform_owner(user_id=plain, actor_user_id=owner_b, actor_email=None, target_email=None)
    with pytest.raises(platform_roles.ActorNotPlatformOwnerError):
        platform_roles.revoke_platform_owner(user_id=third, actor_user_id=owner_b, actor_email=None, target_email=None)
    assert _owners(cursor) == {owner_a, third}


def test_mutual_revoke_with_three_owners_removes_only_one(team):
    # Review finding: A revokes B while B revokes A — both passed the request's
    # role check before either transaction ran. Only one may win.
    cursor, _, owner_a, owner_b, *_ = team
    third = str(uuid4())
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (third,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (third,))
    barrier = Barrier(2)

    def revoke(target, actor):
        barrier.wait()
        try:
            return platform_roles.revoke_platform_owner(
                user_id=target, actor_user_id=actor, actor_email=None, target_email=None
            )
        except platform_roles.ActorNotPlatformOwnerError:
            return "refused"

    for _ in range(5):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(map(str, pool.map(revoke, (owner_a, owner_b), (owner_b, owner_a))))
        assert results == ["True", "refused"]
        assert len(_owners(cursor)) == 2 and third in _owners(cursor)
        with cursor() as cur:
            cur.execute(
                "INSERT INTO platform_owners(user_id) VALUES (%s), (%s) ON CONFLICT DO NOTHING", (owner_a, owner_b)
            )
