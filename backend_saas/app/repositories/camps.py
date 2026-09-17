"""
Camp repository — read-only, published camps only.

Every query here is explicitly scoped by `tenant.organization_id`, sourced
from an already-resolved TenantContext (see app/tenancy.py) — never from a
raw client-supplied organization_id (see README.md "Tenant isolation"). This
is what makes cross-tenant camp access structurally impossible at this
layer, on top of the composite FK safeguard already enforced at the
database level (supabase/migrations/20260917133748_create_saas_schema_v1.sql,
camp_registrations_camp_org_fk — not directly relevant to reads, but the
same organization_id-scoping principle).
"""

from __future__ import annotations

from typing import Optional

from .. import db
from ..tenancy import TenantContext

_CAMP_FIELDS = """
    slug, title, start_date, end_date, registration_start, registration_end,
    age_min, age_max, capacity, price_cents, currency
"""

_LIST_PUBLISHED = f"""
    select {_CAMP_FIELDS}
    from camps
    where organization_id = %s
      and status = 'published'
    order by start_date asc, slug asc
"""

_GET_PUBLISHED_BY_SLUG = f"""
    select {_CAMP_FIELDS}
    from camps
    where organization_id = %s
      and slug = %s
      and status = 'published'
"""


def list_published_camps(tenant: TenantContext) -> list[dict]:
    """All published camps for this tenant, soonest start_date first."""
    with db.get_cursor() as cur:
        cur.execute(_LIST_PUBLISHED, (tenant.organization_id,))
        return cur.fetchall()


def get_published_camp_by_slug(tenant: TenantContext, camp_slug: str) -> Optional[dict]:
    """
    A single published camp for this tenant.

    Returns None for all three of: an unknown slug, a non-published camp
    (draft/closed/archived), and a camp slug that only exists under a
    *different* organization_id. These are indistinguishable by design —
    the WHERE clause excludes them identically, so nothing downstream can
    accidentally leak which case actually happened.
    """
    with db.get_cursor() as cur:
        cur.execute(_GET_PUBLISHED_BY_SLUG, (tenant.organization_id, camp_slug))
        return cur.fetchone()
