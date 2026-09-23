"""
Platform-admin endpoints — onboard and edit tenants, and read (not write)
what a tenant's organizer needs to run their camps: their camps regardless
of status, and each camp's registrations.

Everything here except /admin/login is gated by
app/admin_auth.py::require_platform_admin. There is no per-tenant admin yet
(no organization_members) — a valid token grants access to every
organization. Still no delete for organizations/camps. Registration
lifecycle writes (waitlist promotion, cancellation, manual payment-status
bookkeeping) are now exposed here too — see promote_waitlist,
cancel_registration, update_registration_payment_status below — on top of
the already-tested internal repository functions in
app/repositories/registrations.py that predate this router surface.

Never logs request bodies here beyond a slug — organization contact details
and registration data (parent contacts, allergies, medical notes) are
personal data worth the same logging discipline as
app/routers/registrations.py applies to child data.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..admin_auth import create_admin_token, require_platform_admin, verify_admin_password
from ..admin_resolve import require_camp, require_organization
from uuid import UUID

from ..admin_schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    CampAdminOut,
    CampCreate,
    CampUpdate,
    CancelRegistrationResponse,
    OrganizationAdminListItem,
    OrganizationAdminOut,
    OrganizationCreate,
    OrganizationUpdate,
    PaymentStatusUpdate,
    RegistrationAdminOut,
    WaitlistPromoteResponse,
)
from ..config import get_settings
from ..registration_lifecycle import InvalidStatusTransitionError
from ..repositories import camps as camps_repo
from ..repositories import organizations as organizations_repo
from ..repositories import registrations as registrations_repo
from ..repositories.camps import CampSlugConflictError
from ..repositories.organizations import OrganizationSlugConflictError
from ..repositories.registrations import RegistrationNotFoundError
from ..tenancy import TenantContext

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


@router.get(
    "/organizations",
    response_model=list[OrganizationAdminListItem],
    dependencies=[Depends(require_platform_admin)],
)
def list_organizations() -> list[OrganizationAdminListItem]:
    """Every organization regardless of plan_status, for the platform
    console's tenant list — see organizations_repo.list_organizations's
    docstring for why this is safe only behind require_platform_admin."""
    rows = organizations_repo.list_organizations()
    return [OrganizationAdminListItem.model_validate(row) for row in rows]


@router.get(
    "/organizations/{organization_slug}",
    response_model=OrganizationAdminOut,
    dependencies=[Depends(require_platform_admin)],
)
def get_organization(organization_slug: str) -> OrganizationAdminOut:
    """Single-organization admin detail — powers the platform console's
    Vereinsdetailseite (setup-progress checklist) and the operator preview
    of an unpublished (draft) organization's public page, which the public
    GET /api/v1/organizations/{slug} endpoint would 404 on by design (see
    tenancy.py's site_published check)."""
    organization = require_organization(organization_slug)
    return OrganizationAdminOut.model_validate(organization)


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

    # Betreiberaktion mit eigenem Log-Ereignis, nicht nur im generischen
    # "updated" verloren — Veröffentlichen/Zurückziehen ist die einzige
    # Aktion in diesem Endpunkt, die die öffentliche Sichtbarkeit eines
    # ganzen Vereins umschaltet.
    if data.model_fields_set and "site_published" in data.model_fields_set:
        logger.info(
            "Organization publish state changed (slug=%s, site_published=%s)",
            organization_slug,
            row["site_published"],
        )
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
    organization = require_organization(organization_slug)

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


@router.patch(
    "/organizations/{organization_slug}/camps/{camp_slug}",
    response_model=CampAdminOut,
    dependencies=[Depends(require_platform_admin)],
)
def update_camp(organization_slug: str, camp_slug: str, data: CampUpdate) -> CampAdminOut:
    """Mirrors update_organization's shape exactly — see CampUpdate's
    docstring for why `slug` isn't a field here."""
    organization = require_organization(organization_slug)

    try:
        row = camps_repo.update_camp(organization["id"], camp_slug, data)
    except Exception:
        logger.exception(
            "Camp update failed unexpectedly (organization_slug=%s, camp_slug=%s)",
            organization_slug,
            camp_slug,
        )
        raise HTTPException(status_code=500, detail="Camp could not be updated") from None

    if row is None:
        raise HTTPException(status_code=404, detail="Camp not found")

    logger.info("Camp updated (organization_slug=%s, camp_slug=%s)", organization_slug, camp_slug)
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
    organization = require_organization(organization_slug)

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
    organization = require_organization(organization_slug)
    camp = require_camp(organization, camp_slug)

    rows = registrations_repo.list_registrations_for_camp(organization["id"], camp["id"])
    return [RegistrationAdminOut.model_validate(row) for row in rows]


def _admin_tenant(organization: dict) -> TenantContext:
    """
    Builds a TenantContext directly from an already-resolved admin
    organization row, deliberately WITHOUT going through
    tenancy.resolve_tenant() — that helper 404s on a suspended/cancelled
    organization, which is correct for the public API but wrong here: an
    admin must still be able to promote/cancel registrations for a
    suspended organization (same reasoning as create_camp's docstring for
    why it resolves via organizations_repo directly). The registrations
    repository functions this feeds (promote_next_waitlisted_registration,
    cancel_registration_and_promote_next) only ever read `.organization_id`
    off it, so the extra fields being copied from the same trusted row is
    equivalent, not a weaker check.
    """
    return TenantContext(
        organization_id=organization["id"],
        slug=organization["slug"],
        name=organization["name"],
        plan_status=organization["plan_status"],
    )


@router.post(
    "/organizations/{organization_slug}/camps/{camp_slug}/waitlist/promote",
    response_model=WaitlistPromoteResponse,
    dependencies=[Depends(require_platform_admin)],
)
def promote_waitlist(organization_slug: str, camp_slug: str) -> WaitlistPromoteResponse:
    """
    Exposes the existing, already-tested
    registrations_repo.promote_next_waitlisted_registration (internal-only
    since CP-S406) as the first HTTP entry point for it. Always promotes
    the single oldest ('created_at asc, id asc') waitlisted registration
    for this camp, never a caller-chosen one — the Warteliste screen shows
    that same FIFO order, so "promote next" always matches what's visibly
    first in the list. A `null` result (no free capacity, or no one
    waitlisted) is a normal, non-error outcome — see
    WaitlistPromoteResponse's docstring.
    """
    organization = require_organization(organization_slug)
    camp = require_camp(organization, camp_slug)

    promoted = registrations_repo.promote_next_waitlisted_registration(_admin_tenant(organization), camp["id"])
    logger.info(
        "Waitlist promotion attempted (organization_slug=%s, camp_slug=%s, promoted=%s)",
        organization_slug,
        camp_slug,
        promoted is not None,
    )
    return WaitlistPromoteResponse(promoted=promoted)


@router.post(
    "/organizations/{organization_slug}/camps/{camp_slug}/registrations/{registration_token}/cancel",
    response_model=CancelRegistrationResponse,
    dependencies=[Depends(require_platform_admin)],
)
def cancel_registration(organization_slug: str, camp_slug: str, registration_token: UUID) -> CancelRegistrationResponse:
    """
    Exposes registrations_repo.cancel_registration_and_promote_next as an
    HTTP entry point. Looked up by `registration_token` (the public
    identifier), never the internal `id` — see root CLAUDE.md
    "registration_token vs. id". `camp_id` (resolved from `camp_slug`
    below) is passed into the repository call and is a real authorization
    boundary there (see that function's docstring) — a URL naming the
    wrong camp for a registration that exists under a *different* camp in
    this same organization 404s, it does not silently act on it. (An
    earlier version of this endpoint claimed that guarantee here without
    the repository function actually enforcing it — fixed at the
    repository layer, not just described here.)
    """
    organization = require_organization(organization_slug)
    camp = require_camp(organization, camp_slug)

    try:
        result = registrations_repo.cancel_registration_and_promote_next(
            _admin_tenant(organization), camp["id"], registration_token
        )
    except RegistrationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Registration not found") from exc
    except InvalidStatusTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    logger.info(
        "Registration cancelled (organization_slug=%s, camp_slug=%s, promoted=%s)",
        organization_slug,
        camp_slug,
        result["promoted"] is not None,
    )
    return CancelRegistrationResponse(**result)


@router.patch(
    "/organizations/{organization_slug}/camps/{camp_slug}/registrations/{registration_token}/payment-status",
    response_model=RegistrationAdminOut,
    dependencies=[Depends(require_platform_admin)],
)
def update_registration_payment_status(
    organization_slug: str, camp_slug: str, registration_token: UUID, data: PaymentStatusUpdate
) -> RegistrationAdminOut:
    """Manual payment bookkeeping — see
    registrations_repo.update_payment_status's docstring for why this has
    no state-machine transition rules (unlike `status`), why it's scoped by
    `camp_id` too (not just organization_id), and why it's looked up by
    `registration_token` rather than the internal `id`."""
    organization = require_organization(organization_slug)
    camp = require_camp(organization, camp_slug)

    row = registrations_repo.update_payment_status(organization["id"], camp["id"], registration_token, data.payment_status)
    if row is None:
        raise HTTPException(status_code=404, detail="Registration not found")

    logger.info(
        "Registration payment_status updated (organization_slug=%s, camp_slug=%s, payment_status=%s)",
        organization_slug,
        camp_slug,
        data.payment_status,
    )
    return RegistrationAdminOut.model_validate(row)
