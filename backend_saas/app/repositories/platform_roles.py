"""
Repository for the platform-foundation role model: platform_owners
(global, cross-org access) and organization_members (org_admin, scoped to
one organization), plus audit_log writes/reads. See
supabase/migrations/20260923220000_add_platform_roles_and_audit_log.sql for
the schema these functions assume.

Same tenant-isolation discipline as every other repository in this
service (see repositories/organizations.py's module docstring): every
query here is parametrized, and every org-scoped query filters by
organization_id — never trusts a caller-supplied value without it having
gone through app/auth_deps.py first.
"""

from __future__ import annotations

from typing import Optional

from psycopg2.extras import Json

from .. import db


def is_platform_owner(user_id: str) -> bool:
    with db.get_cursor() as cur:
        cur.execute("select 1 from platform_owners where user_id = %s", (user_id,))
        return cur.fetchone() is not None


def get_admin_organization_ids(user_id: str) -> list[str]:
    """Every organization_id this user is org_admin for. Empty for a
    platform_owner too (they don't need membership rows — see
    app/auth_deps.py, which never calls this for an owner)."""
    with db.get_cursor() as cur:
        cur.execute(
            "select organization_id from organization_members where user_id = %s and role = 'org_admin'",
            (user_id,),
        )
        return [str(row["organization_id"]) for row in cur.fetchall()]


def is_org_admin(user_id: str, organization_id: str) -> bool:
    with db.get_cursor() as cur:
        cur.execute(
            "select 1 from organization_members where user_id = %s and organization_id = %s and role = 'org_admin'",
            (user_id, organization_id),
        )
        return cur.fetchone() is not None


def add_platform_owner(user_id: str) -> None:
    """Idempotent — re-running the setup script for a user who's already
    an owner is a no-op, not a conflict error."""
    with db.get_cursor() as cur:
        cur.execute(
            "insert into platform_owners (user_id) values (%s) on conflict (user_id) do nothing",
            (user_id,),
        )


def add_organization_member(organization_id: str, user_id: str, role: str = "org_admin") -> dict:
    with db.get_cursor() as cur:
        cur.execute(
            """
            insert into organization_members (organization_id, user_id, role)
            values (%s, %s, %s)
            on conflict (organization_id, user_id) do update set role = excluded.role
            returning id, organization_id, user_id, role, created_at
            """,
            (organization_id, user_id, role),
        )
        return cur.fetchone()


def remove_organization_member(organization_id: str, member_id: str) -> bool:
    with db.get_cursor() as cur:
        cur.execute(
            "delete from organization_members where id = %s and organization_id = %s",
            (member_id, organization_id),
        )
        return cur.rowcount > 0


def list_organization_members(organization_id: str) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            "select id, organization_id, user_id, role, created_at from organization_members "
            "where organization_id = %s order by created_at asc",
            (organization_id,),
        )
        return cur.fetchall()


def write_audit_log(
    *,
    actor_user_id: Optional[str],
    actor_email: Optional[str],
    action: str,
    organization_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Never raises into the caller's request path — a missing audit_log
    table (e.g. migration not yet applied, see the migration file's
    "Anwendungsstatus") must not turn an otherwise-successful admin action
    into a 500. Logged and swallowed instead; app/routers/admin.py callers
    do not need a try/except of their own."""
    import logging

    logger = logging.getLogger(__name__)
    try:
        with db.get_cursor() as cur:
            cur.execute(
                """
                insert into audit_log
                    (actor_user_id, actor_email, action, organization_id, target_type, target_id, metadata)
                values (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    actor_user_id,
                    actor_email,
                    action,
                    organization_id,
                    target_type,
                    target_id,
                    Json(metadata) if metadata is not None else None,
                ),
            )
    except Exception:
        logger.exception("Audit log write failed (action=%s, organization_id=%s)", action, organization_id)


def list_audit_log(organization_id: Optional[str] = None, limit: int = 200) -> list[dict]:
    with db.get_cursor() as cur:
        if organization_id:
            cur.execute(
                "select id, actor_user_id, actor_email, action, organization_id, target_type, target_id, "
                "metadata, created_at from audit_log where organization_id = %s "
                "order by created_at desc limit %s",
                (organization_id, limit),
            )
        else:
            cur.execute(
                "select id, actor_user_id, actor_email, action, organization_id, target_type, target_id, "
                "metadata, created_at from audit_log order by created_at desc limit %s",
                (limit,),
            )
        return cur.fetchall()
