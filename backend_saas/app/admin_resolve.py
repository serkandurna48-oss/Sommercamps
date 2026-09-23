"""
Shared organization/camp resolve-or-404 helpers for platform-admin routes.

Deliberately resolves via organizations_repo/camps_repo directly, never
tenancy.resolve_tenant() — that helper 404s on a suspended/cancelled
organization, which is correct for the public API but wrong for admin
routes (an admin must still be able to see/edit a suspended organization).
Extracted from app/routers/admin.py and app/routers/exports.py, which had
repeated this identical lookup-or-404 pair independently (cleanup after
code review).
"""

from __future__ import annotations

from fastapi import HTTPException

from .repositories import camps as camps_repo
from .repositories import organizations as organizations_repo


def require_organization(organization_slug: str) -> dict:
    organization = organizations_repo.get_organization_by_slug(organization_slug)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


def require_camp(organization: dict, camp_slug: str) -> dict:
    camp = camps_repo.get_camp_by_slug(organization["id"], camp_slug)
    if camp is None:
        raise HTTPException(status_code=404, detail="Camp not found")
    return camp
