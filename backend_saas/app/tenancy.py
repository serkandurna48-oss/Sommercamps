"""
Tenant resolution — the single trusted path from a URL slug to an
organization_id.

Grounding rule (see README.md "Tenant isolation" for the full version):
an organization_id is NEVER taken unchecked from a client request. Every
tenant-scoped repository function added in later tickets must receive a
TenantContext (or its organization_id) that was produced by resolve_tenant()
below — never a raw organization_id read straight off a request.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from .repositories import organizations


class TenantResolutionError(Exception):
    """Base class for tenant resolution failures."""


class TenantNotFoundError(TenantResolutionError):
    def __init__(self, slug: str):
        self.slug = slug
        super().__init__(f"No organization found for slug '{slug}'")


class TenantInactiveError(TenantResolutionError):
    """Organization exists but its plan_status doesn't allow active use."""

    def __init__(self, slug: str, plan_status: str):
        self.slug = slug
        self.plan_status = plan_status
        super().__init__(f"Organization '{slug}' is not active (plan_status={plan_status})")


class TenantUnpublishedError(TenantResolutionError):
    """Organization exists, plan_status is fine, but site_published is
    false — it's an operator-side draft (Betreiber-Builder, see
    admin_schemas.OrganizationCreate.site_published) not yet deliberately
    published. Distinct from TenantInactiveError purely for clearer
    server-side logging; app/deps.py maps both to the identical public 404,
    same reasoning as the plan_status case below."""

    def __init__(self, slug: str):
        self.slug = slug
        super().__init__(f"Organization '{slug}' is not published yet")


# Mirrors organizations.plan_status's CHECK constraint (see
# supabase/migrations/20260917133748_create_saas_schema_v1.sql): pilot and
# active are usable tenants; suspended and cancelled are not. This is a
# deliberately simple binary split for CP-S403 — no plan-tier or billing
# nuance beyond "usable vs. not" belongs here yet.
_ACTIVE_PLAN_STATUSES = frozenset({"pilot", "active"})


@dataclass(frozen=True)
class TenantContext:
    """
    The trusted, server-resolved identity of the tenant a request is scoped
    to. Construct only via resolve_tenant().
    """

    organization_id: UUID
    slug: str
    name: str
    plan_status: str


def resolve_tenant(slug: str) -> TenantContext:
    """
    Resolves a URL slug to a TenantContext.

    Raises TenantNotFoundError if no organization matches the slug,
    TenantInactiveError if the organization exists but its plan_status is
    not in _ACTIVE_PLAN_STATUSES (e.g. suspended/cancelled), and
    TenantUnpublishedError if site_published is false (an operator-side
    draft, see admin_schemas.OrganizationCreate.site_published) — none of
    these three is treated the same as a genuinely active, published
    tenant. This function is only ever reached from the *public* surface
    (app/deps.py::get_tenant_context); the admin surface resolves
    organizations directly via organizations_repo (see admin_resolve.py)
    specifically so an operator can still open/preview/publish a draft or
    suspended organization, which this function would otherwise 404 on.
    """
    org = organizations.get_organization_by_slug(slug)
    if org is None:
        raise TenantNotFoundError(slug)
    if org["plan_status"] not in _ACTIVE_PLAN_STATUSES:
        raise TenantInactiveError(slug, org["plan_status"])
    if not org["site_published"]:
        raise TenantUnpublishedError(slug)
    return TenantContext(
        organization_id=org["id"],
        slug=org["slug"],
        name=org["name"],
        plan_status=org["plan_status"],
    )
