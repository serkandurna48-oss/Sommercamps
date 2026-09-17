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

    Raises TenantNotFoundError if no organization matches the slug, and
    TenantInactiveError if the organization exists but its plan_status is
    not in _ACTIVE_PLAN_STATUSES (e.g. suspended/cancelled) — an inactive
    tenant is deliberately not treated the same as an active one.
    """
    org = organizations.get_organization_by_slug(slug)
    if org is None:
        raise TenantNotFoundError(slug)
    if org["plan_status"] not in _ACTIVE_PLAN_STATUSES:
        raise TenantInactiveError(slug, org["plan_status"])
    return TenantContext(
        organization_id=org["id"],
        slug=org["slug"],
        name=org["name"],
        plan_status=org["plan_status"],
    )
