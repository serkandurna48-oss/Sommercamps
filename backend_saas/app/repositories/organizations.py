"""
Organization repository — read-only, single lookup-by-slug query.

Not a CRUD API. No write operations. No "list all organizations" endpoint —
that would leak the tenant list across tenants. If future tickets need more
organization data access, add narrowly-scoped functions here rather than
widening this one further.
"""

from __future__ import annotations

from typing import Optional

from .. import db

_SELECT_BY_SLUG = """
    select id, slug, name, legal_name, contact_email, contact_phone,
           logo_url, primary_color, plan_status
    from organizations
    where slug = %s
"""


def get_organization_by_slug(slug: str) -> Optional[dict]:
    """
    The one organization-by-slug query in this service. Used both for
    tenant resolution (app.tenancy.resolve_tenant reads id/slug/name/
    plan_status from the result) and for the public organization endpoint
    (app.routers.organizations reads the branding/contact fields via
    OrganizationPublic, which — like every response model — only ever
    exposes the fields it explicitly declares; `id` and `plan_status` being
    present in this dict does not make them public).

    Returns None if no organization matches. SQL is parametrized; `slug` is
    never interpolated into the query text.
    """
    with db.get_cursor() as cur:
        cur.execute(_SELECT_BY_SLUG, (slug,))
        return cur.fetchone()
