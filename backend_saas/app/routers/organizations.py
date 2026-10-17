"""Public, read-only Organization endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_tenant_context
from ..repositories import organizations as organizations_repo
from ..schemas import OrganizationPublic
from ..tenancy import TenantContext

router = APIRouter(prefix="/api/v1/organizations", tags=["Organizations"])


@router.get("/{organization_slug}", response_model=OrganizationPublic)
def get_organization(tenant: TenantContext = Depends(get_tenant_context)) -> OrganizationPublic:
    """
    `get_tenant_context` already confirmed the organization exists and is
    active. The re-fetch by `tenant.slug` (a second, cheap indexed lookup)
    gets the full public field set — TenantContext deliberately stays
    minimal (see tenancy.py) rather than carrying branding/contact data
    that most other tenant-scoped endpoints will never need.
    """
    org = organizations_repo.get_organization_by_slug(tenant.slug)
    return OrganizationPublic.model_validate(org)
