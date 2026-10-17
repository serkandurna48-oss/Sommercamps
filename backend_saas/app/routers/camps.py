"""Public, read-only Camp endpoints — collection and detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_tenant_context
from ..repositories import camps as camps_repo
from ..schemas import CampPublic
from ..tenancy import TenantContext

router = APIRouter(prefix="/api/v1/organizations/{organization_slug}/camps", tags=["Camps"])


@router.get("", response_model=list[CampPublic])
def list_camps(tenant: TenantContext = Depends(get_tenant_context)) -> list[CampPublic]:
    rows = camps_repo.list_published_camps(tenant)
    return [CampPublic.model_validate(row) for row in rows]


@router.get("/{camp_slug}", response_model=CampPublic)
def get_camp(camp_slug: str, tenant: TenantContext = Depends(get_tenant_context)) -> CampPublic:
    row = camps_repo.get_published_camp_by_slug(tenant, camp_slug)
    if row is None:
        # Covers unknown slug, draft/closed/archived, and cross-tenant
        # slug collisions identically — see get_published_camp_by_slug's
        # docstring for why that's intentional, not a missed distinction.
        raise HTTPException(status_code=404, detail="Camp not found")
    return CampPublic.model_validate(row)
