"""
Platform-admin endpoints — onboard and edit tenants, and read (not write)
what a tenant's organizer needs to run their camps: their camps regardless
of status, and each camp's registrations.

Everything here except /admin/login is gated by
app/admin_auth.py::require_platform_admin. There is no per-tenant admin yet
(no organization_members) — a valid token grants access to every
organization. Still no delete, no registration *writes* (cancel/promote
stay internal-only, see app/repositories/registrations.py) — those remain
out of scope (see docs/saas/migration-strategy.md and the Richtung-C
Auftrag Abschnitt 1).

Never logs request bodies here beyond a slug — organization contact details
and registration data (parent contacts, allergies, medical notes) are
personal data worth the same logging discipline as
app/routers/registrations.py applies to child data.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..admin_auth import create_admin_token, require_platform_admin, verify_admin_password
from ..admin_schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    CampAdminOut,
    CampCreate,
    OrganizationAdminOut,
    OrganizationCreate,
    OrganizationUpdate,
    RegistrationAdminOut,
)
from ..config import get_settings
from ..repositories import camps as camps_repo
from ..repositories import organizations as organizations_repo
from ..repositories import registrations as registrations_repo
from ..repositories.camps import CampSlugConflictError
from ..repositories.organizations import OrganizationSlugConflictError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(payload: AdminLoginRequest) -> AdminLoginResponse:
    """Timing-safe password check; the error message gives no hint whether
    the password was close to correct."""
    if not verify_admin_password(payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login failed")
    settings = get_settings()
    return AdminLoginResponse(token=create_admin_token(), expires_in_hours=settings.token_expire_hours)


@router.post(
    "/organizations",
    response_model=OrganizationAdminOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_platform_admin)],
)
def create_organization(data: OrganizationCreate) -> OrganizationAdminOut:
    try:
        row = organizations_repo.create_organization(data)
    except OrganizationSlugConflictError as exc:
        logger.info("Organization creation rejected: slug conflict (slug=%s)", data.slug)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use") from exc
    except Exception:
        logger.exception("Organization creation failed unexpectedly (slug=%s)", data.slug)
        raise HTTPException(status_code=500, detail="Organization could not be created") from None

    logger.info("Organization created (slug=%s)", data.slug)
    return OrganizationAdminOut.model_validate(row)


@router.patch(
    "/organizations/{organization_slug}",
    response_model=OrganizationAdminOut,
    dependencies=[Depends(require_platform_admin)],
)
def update_organization(organization_slug: str, data: OrganizationUpdate) -> OrganizationAdminOut:
    try:
        row = organizations_repo.update_organization(organization_slug, data)
    except Exception:
        logger.exception("Organization update failed unexpectedly (slug=%s)", organization_slug)
        raise HTTPException(status_code=500, detail="Organization could not be updated") from None

    if row is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    logger.info("Organization updated (slug=%s)", organization_slug)
    return OrganizationAdminOut.model_validate(row)


@router.post(
    "/organizations/{organization_slug}/camps",
    response_model=CampAdminOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_platform_admin)],
)
def create_camp(organization_slug: str, data: CampCreate) -> CampAdminOut:
    """
    Resolves organization_slug via organizations_repo.get_organization_by_slug
    — deliberately not tenancy.resolve_tenant/get_tenant_context, since an
    admin must be able to add a camp to a `suspended` organization too,
    which the tenant-resolution path would 404 on.
    """
    organization = organizations_repo.get_organization_by_slug(organization_slug)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    try:
        row = camps_repo.create_camp(organization["id"], data)
    except CampSlugConflictError as exc:
        logger.info(
            "Camp creation rejected: slug conflict (organization_slug=%s, camp_slug=%s)",
            organization_slug,
            data.slug,
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use") from exc
    except Exception:
        logger.exception(
            "Camp creation failed unexpectedly (organization_slug=%s, camp_slug=%s)",
            organization_slug,
            data.slug,
        )
        raise HTTPException(status_code=500, detail="Camp could not be created") from None

    logger.info("Camp created (organization_slug=%s, camp_slug=%s)", organization_slug, data.slug)
    return CampAdminOut.model_validate(row)


@router.get(
    "/organizations/{organization_slug}/camps",
    response_model=list[CampAdminOut],
    dependencies=[Depends(require_platform_admin)],
)
def list_camps(organization_slug: str) -> list[CampAdminOut]:
    """Every camp for this org regardless of status — unlike the public
    GET /api/v1/.../camps, which only ever returns published ones. Powers
    the Organisation-Dashboard's "Alle Camps" block."""
    organization = organizations_repo.get_organization_by_slug(organization_slug)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    rows = camps_repo.list_camps_for_organization(organization["id"])
    return [CampAdminOut.model_validate(row) for row in rows]


@router.get(
    "/organizations/{organization_slug}/camps/{camp_slug}/registrations",
    response_model=list[RegistrationAdminOut],
    dependencies=[Depends(require_platform_admin)],
)
def list_registrations(organization_slug: str, camp_slug: str) -> list[RegistrationAdminOut]:
    """
    Every registration for this camp regardless of status. No aggregates
    here on purpose (Auftrag Abschnitt 9.1: Belegung, offene Zahlungen,
    Warteliste-Anzahl werden im Frontend aus diesen Rohdaten berechnet, nicht
    als eigene Backend-Felder geführt) — this is the raw list that both the
    Organisation-Dashboard's Band-Kennzahlen and the Command Center's
    Teilnehmerliste read from.
    """
    organization = organizations_repo.get_organization_by_slug(organization_slug)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    camp = camps_repo.get_camp_by_slug(organization["id"], camp_slug)
    if camp is None:
        raise HTTPException(status_code=404, detail="Camp not found")

    rows = registrations_repo.list_registrations_for_camp(organization["id"], camp["id"])
    return [RegistrationAdminOut.model_validate(row) for row in rows]
