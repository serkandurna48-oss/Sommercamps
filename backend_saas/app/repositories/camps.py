"""
Camp repository — public reads (published camps only) plus platform-admin
camp creation.

Every *public* query here is explicitly scoped by `tenant.organization_id`,
sourced from an already-resolved TenantContext (see app/tenancy.py) — never
from a raw client-supplied organization_id (see README.md "Tenant
isolation"). This is what makes cross-tenant camp access structurally
impossible at this layer, on top of the composite FK safeguard already
enforced at the database level
(supabase/migrations/20260917133748_create_saas_schema_v1.sql,
camp_registrations_camp_org_fk — not directly relevant to reads, but the
same organization_id-scoping principle).

create_camp is the one exception: it takes a raw organization_id because it
exists only for the platform-admin surface (app/routers/admin.py, gated by
app/auth_deps.py::require_org_access), which resolves that id itself via
organizations.get_organization_by_slug — never from an untrusted client
parameter either, just not from a TenantContext (an admin isn't "the
tenant").
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

import psycopg2.errors

from .. import db
from ..admin_schemas import CampCreate, CampUpdate
from ..registration_lifecycle import CAPACITY_COUNTING_STATUSES
from ..tenancy import TenantContext

_CAMP_FIELDS = """
    slug, title, start_date, end_date, registration_start, registration_end,
    age_min, age_max, capacity, price_cents, currency
"""

# Eltern-Flow-Auftrag §6.1/§6.2: Belegungsbalken und Wartelistenzahl sind
# öffentlich (siehe CampPublic.registered_count/waitlist_count) — beide
# Subqueries korrelieren zusätzlich über organization_id, nicht nur camp_id,
# rein defensiv im selben Stil wie _COUNT_ACTIVE_REGISTRATIONS in
# repositories/registrations.py, obwohl camps.id bereits eindeutig ist.
# CAPACITY_COUNTING_STATUSES ist dieselbe Single-Source-of-Truth, die auch
# die Kapazitätsprüfung beim Anlegen einer Anmeldung verwendet — kann nie
# von deren Definition abweichen.
_OCCUPANCY_SUBQUERIES = """
    (select count(*) from camp_registrations r
       where r.camp_id = c.id and r.organization_id = c.organization_id
         and r.status = any(%s)) as registered_count,
    (select count(*) from camp_registrations r
       where r.camp_id = c.id and r.organization_id = c.organization_id
         and r.status = 'waitlist') as waitlist_count
"""

_CAMP_FIELDS_WITH_OCCUPANCY = f"""
    c.slug, c.title, c.start_date, c.end_date, c.registration_start, c.registration_end,
    c.age_min, c.age_max, c.capacity, c.price_cents, c.currency,
    c.location, c.care_info, c.meals_info, c.includes,
    {_OCCUPANCY_SUBQUERIES}
"""

_LIST_PUBLISHED = f"""
    select {_CAMP_FIELDS_WITH_OCCUPANCY}
    from camps c
    where c.organization_id = %s
      and c.status = 'published'
    order by c.start_date asc, c.slug asc
"""

_GET_PUBLISHED_BY_SLUG = f"""
    select {_CAMP_FIELDS_WITH_OCCUPANCY}
    from camps c
    where c.organization_id = %s
      and c.slug = %s
      and c.status = 'published'
"""

_CAPACITY_COUNTING_STATUSES_LIST = list(CAPACITY_COUNTING_STATUSES)


def list_published_camps(tenant: TenantContext) -> list[dict]:
    """All published camps for this tenant, soonest start_date first."""
    with db.get_cursor() as cur:
        cur.execute(_LIST_PUBLISHED, (_CAPACITY_COUNTING_STATUSES_LIST, tenant.organization_id))
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
        cur.execute(
            _GET_PUBLISHED_BY_SLUG,
            (_CAPACITY_COUNTING_STATUSES_LIST, tenant.organization_id, camp_slug),
        )
        return cur.fetchone()


class CampSlugConflictError(Exception):
    """A camp with this slug already exists under this organization — maps
    to 409 (camps.slug is unique per-organization, not globally — see
    camps_organization_id_slug_key)."""

    def __init__(self, organization_id: UUID, slug: str):
        self.organization_id = organization_id
        self.slug = slug
        super().__init__(f"Camp slug '{slug}' already exists for organization '{organization_id}'")


_ADMIN_CAMP_FIELDS = """
    id, organization_id, slug, title, start_date, end_date,
    registration_start, registration_end, age_min, age_max, capacity,
    price_cents, currency, location, care_info, meals_info, includes, status
"""

_INSERT_CAMP = f"""
    insert into camps (
        organization_id, slug, title, start_date, end_date,
        registration_start, registration_end, age_min, age_max, capacity,
        price_cents, currency, location, care_info, meals_info, includes, status
    ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    returning {_ADMIN_CAMP_FIELDS}
"""


_LIST_ADMIN = f"""
    select {_ADMIN_CAMP_FIELDS}
    from camps
    where organization_id = %s
    order by start_date asc, slug asc
"""

_GET_ADMIN_BY_SLUG = f"""
    select {_ADMIN_CAMP_FIELDS}
    from camps
    where organization_id = %s
      and slug = %s
"""


def list_camps_for_organization(organization_id: UUID) -> list[dict]:
    """Platform-admin only — every camp regardless of status (draft/
    published/closed/archived), unlike list_published_camps. organization_id
    must already be resolved server-side, same rule as create_camp."""
    with db.get_cursor() as cur:
        cur.execute(_LIST_ADMIN, (organization_id,))
        return cur.fetchall()


def get_camp_by_slug(organization_id: UUID, camp_slug: str) -> Optional[dict]:
    """Platform-admin only — a single camp regardless of status. Deliberately
    not get_published_camp_by_slug: an admin must be able to resolve a draft
    or closed camp (e.g. to list its registrations), which that public-only
    lookup would treat as not found."""
    with db.get_cursor() as cur:
        cur.execute(_GET_ADMIN_BY_SLUG, (organization_id, camp_slug))
        return cur.fetchone()


def create_camp(organization_id: UUID, data: CampCreate) -> dict:
    """Platform-admin only. `organization_id` must already be resolved
    server-side (see app/routers/admin.py — via
    organizations.get_organization_by_slug, never a client-supplied id
    directly). Raises CampSlugConflictError if this organization already has
    a camp with this slug (DB-enforced via camps_organization_id_slug_key —
    the authoritative check; CampCreate's format validator only catches
    malformed slugs, not duplicates)."""
    with db.get_cursor() as cur:
        try:
            cur.execute(
                _INSERT_CAMP,
                (
                    organization_id,
                    data.slug,
                    data.title,
                    data.start_date,
                    data.end_date,
                    data.registration_start,
                    data.registration_end,
                    data.age_min,
                    data.age_max,
                    data.capacity,
                    data.price_cents,
                    data.currency,
                    data.location,
                    data.care_info,
                    data.meals_info,
                    data.includes,
                    data.status,
                ),
            )
        except psycopg2.errors.UniqueViolation as exc:
            raise CampSlugConflictError(organization_id, data.slug) from exc
        return cur.fetchone()


def update_camp(organization_id: UUID, camp_slug: str, data: CampUpdate) -> Optional[dict]:
    """
    Platform-admin only. Mirrors organizations.update_organization exactly:
    only fields the caller actually set (`exclude_unset`) are written;
    `slug` itself is immutable (not a field on CampUpdate) since renaming it
    would break every existing registration/parent-facing URL under this
    camp. `organization_id` must already be resolved server-side (same rule
    as create_camp) — this function additionally scopes the WHERE clause by
    it so an admin can never accidentally update a same-slug camp belonging
    to a different organization (camps.slug is unique per-organization, not
    globally — see camps_organization_id_slug_key). Returns None if no camp
    with this slug exists for this organization.

    The column list interpolated into `set_clause` comes only from
    CampUpdate's own declared field names (a fixed set controlled by this
    module, never by request data) — every actual value stays a
    parametrized placeholder, same injection-safety argument as
    update_organization.
    """
    fields = data.model_dump(exclude_unset=True)
    if not fields:
        return get_camp_by_slug(organization_id, camp_slug)

    set_clause = ", ".join(f"{column} = %s" for column in fields)
    query = f"""
        update camps
        set {set_clause}
        where organization_id = %s
          and slug = %s
        returning {_ADMIN_CAMP_FIELDS}
    """
    with db.get_cursor() as cur:
        cur.execute(query, (*fields.values(), organization_id, camp_slug))
        return cur.fetchone()
