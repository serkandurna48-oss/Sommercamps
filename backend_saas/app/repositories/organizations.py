"""
Organization repository — read-only, for tenant resolution only.

Not a CRUD API. No write operations. No "list all organizations" endpoint —
that would leak the tenant list across tenants. If future tickets need more
organization data access, add narrowly-scoped functions here rather than
widening this one.
"""

from __future__ import annotations

from typing import Optional

from .. import db

_SELECT_BY_SLUG = """
    select id, slug, name, plan_status
    from organizations
    where slug = %s
"""


def get_organization_by_slug(slug: str) -> Optional[dict]:
    """
    Returns exactly the fields tenant resolution needs (id, slug, name,
    plan_status) — no contact/branding data. Returns None if no organization
    matches. SQL is parametrized; `slug` is never interpolated into the
    query text.
    """
    with db.get_cursor() as cur:
        cur.execute(_SELECT_BY_SLUG, (slug,))
        return cur.fetchone()
