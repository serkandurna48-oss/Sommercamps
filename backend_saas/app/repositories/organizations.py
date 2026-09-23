"""
Organization repository — lookup-by-slug plus platform-admin writes.

`list_organizations` is platform-admin-only (app/routers/admin.py, gated
by app/admin_auth.py::require_platform_admin) — the public, tenant-scoped
routers never call it and have no route that could return it. The original
concern behind not having a list endpoint ("would leak the tenant list
across tenants") is about the *public* API; it does not apply to the single
platform operator, who by definition needs to see every tenant to run the
platform (list them, onboard a new one). Keep it that way: never expose
list_organizations through an unauthenticated route.

create_organization/update_organization exist only for the platform-admin
surface (app/routers/admin.py, gated by app/admin_auth.py) — the public,
tenant-scoped routers never call them.
"""

from __future__ import annotations

from typing import Optional

import psycopg2.errors

from .. import db
from ..admin_schemas import OrganizationCreate, OrganizationUpdate

_ORGANIZATION_FIELDS = """
    id, slug, name, legal_name, contact_email, contact_phone, contact_person_name,
    logo_url, primary_color, plan_status, theme, iban,
    intro_heading, intro_text, hero_image_url, billing_notes, site_published
"""

_SELECT_BY_SLUG = f"""
    select {_ORGANIZATION_FIELDS}
    from organizations
    where slug = %s
"""

_SELECT_ALL = f"""
    select {', '.join(f'o.{c.strip()}' for c in _ORGANIZATION_FIELDS.strip().split(','))},
           count(c.id) as camp_count
    from organizations o
    left join camps c on c.organization_id = o.id
    group by o.id
    order by o.name asc
"""

_INSERT_ORGANIZATION = f"""
    insert into organizations (
        slug, name, legal_name, contact_email, contact_phone, contact_person_name,
        logo_url, primary_color, plan_status, iban,
        intro_heading, intro_text, hero_image_url, billing_notes, site_published
    ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    returning {_ORGANIZATION_FIELDS}
"""


class OrganizationSlugConflictError(Exception):
    """An organization with this slug already exists — maps to 409."""

    def __init__(self, slug: str):
        self.slug = slug
        super().__init__(f"Organization slug '{slug}' already exists")


def get_organization_by_slug(slug: str) -> Optional[dict]:
    """
    The one organization-by-slug query in this service. Used for tenant
    resolution (app.tenancy.resolve_tenant reads id/slug/name/plan_status
    from the result), the public organization endpoint (app.routers.
    organizations reads the branding/contact fields via OrganizationPublic,
    which — like every response model — only ever exposes the fields it
    explicitly declares; `id` and `plan_status` being present in this dict
    does not make them public), and the admin surface (app/routers/admin.py
    uses it to resolve a slug to an organization_id for camp creation —
    deliberately NOT tenancy.resolve_tenant, since an admin must be able to
    act on a `suspended` organization too, which resolve_tenant would 404 on).

    Returns None if no organization matches. SQL is parametrized; `slug` is
    never interpolated into the query text.
    """
    with db.get_cursor() as cur:
        cur.execute(_SELECT_BY_SLUG, (slug,))
        return cur.fetchone()


def list_organizations() -> list[dict]:
    """Platform-admin only — every organization regardless of plan_status,
    with a `camp_count` (single aggregate query, not one COUNT per
    organization) for the platform console's tenant list. See module
    docstring for why this is safe (no public route ever calls it)."""
    with db.get_cursor() as cur:
        cur.execute(_SELECT_ALL)
        return cur.fetchall()


def create_organization(data: OrganizationCreate) -> dict:
    """Platform-admin only. Raises OrganizationSlugConflictError if the slug
    is already taken (DB-enforced via organizations_slug_key — this is the
    authoritative check; OrganizationCreate's format validator only catches
    malformed slugs, not duplicates)."""
    with db.get_cursor() as cur:
        try:
            cur.execute(
                _INSERT_ORGANIZATION,
                (
                    data.slug,
                    data.name,
                    data.legal_name,
                    str(data.contact_email),
                    data.contact_phone,
                    data.contact_person_name,
                    data.logo_url,
                    data.primary_color,
                    data.plan_status,
                    data.iban,
                    data.intro_heading,
                    data.intro_text,
                    data.hero_image_url,
                    data.billing_notes,
                    data.site_published,
                ),
            )
        except psycopg2.errors.UniqueViolation as exc:
            raise OrganizationSlugConflictError(data.slug) from exc
        return cur.fetchone()


def update_organization(slug: str, data: OrganizationUpdate) -> Optional[dict]:
    """
    Platform-admin only. Only fields the caller actually set (`exclude_unset`
    — a PATCH must be able to distinguish "not mentioned" from "explicitly
    cleared") are written; `slug` itself is immutable (not a field on
    OrganizationUpdate) since renaming it would break every existing camp
    URL under this organization. Returns None if no organization has this
    slug.

    The column list interpolated into `set_clause` below comes only from
    OrganizationUpdate's own declared field names (a fixed set controlled by
    this module, never by request data) — every actual value stays a
    parametrized placeholder, so this remains injection-safe despite the
    f-string.
    """
    fields = data.model_dump(exclude_unset=True)
    if "contact_email" in fields and fields["contact_email"] is not None:
        fields["contact_email"] = str(fields["contact_email"])
    if not fields:
        return get_organization_by_slug(slug)

    set_clause = ", ".join(f"{column} = %s" for column in fields)
    query = f"""
        update organizations
        set {set_clause}
        where slug = %s
        returning {_ORGANIZATION_FIELDS}
    """
    with db.get_cursor() as cur:
        cur.execute(query, (*fields.values(), slug))
        return cur.fetchone()
