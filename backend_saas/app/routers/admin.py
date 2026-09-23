"""
Platform-admin endpoints — onboard and edit tenants, and read (not write)
what a tenant's organizer needs to run their camps: their camps regardless
of status, and each camp's registrations.

Auth/authorization (feat/platform-foundation): every route below requires a
real Supabase Auth account (app/auth_deps.py::get_auth_context) and is
gated either by require_platform_owner (platform-wide actions: creating
organizations, cross-org stats/registrations/audit-log, assigning
org_admins) or require_org_access (one organization's own admin surface —
passes for a platform_owner or that organization's org_admin). This
replaces the previous single ADMIN_PASSWORD/JWT scheme (app/admin_auth.py,
removed) — see docs/PLATFORM_FOUNDATION_HANDOFF.md for the migration
status and current blockers.

Still no delete for organizations/camps. Registration lifecycle writes
(waitlist promotion, cancellation, manual payment-status bookkeeping) are
exposed here on top of the already-tested internal repository functions in
app/repositories/registrations.py that predate this router surface.

Material operator actions (publish/unpublish, payment-status changes,
cancellations, role assignments) are written to audit_log — see the
platform_roles.write_audit_log calls below. A failed audit-log write never
fails the underlying action (see that function's own docstring for why).

Never logs request bodies here beyond a slug — organization contact details
and registration data (parent contacts, allergies, medical notes) are
personal data worth the same logging discipline as
app/routers/registrations.py applies to child data.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from ..admin_resolve import require_camp, require_organization
from ..auth_deps import AuthContext, get_auth_context, require_org_access, require_platform_owner
from .. import supabase_auth
from ..supabase_auth import SupabaseAuthError

from ..admin_schemas import (
    AddOrganizationMemberRequest,
    AuditLogEntryOut,
    CampAdminOut,
    CampCreate,
    CampUpdate,
    CancelRegistrationResponse,
    GlobalRegistrationOut,
    MeOut,
    OrganizationAdminListItem,
    OrganizationAdminOut,
    OrganizationCreate,
    OrganizationMemberOut,
    OrganizationUpdate,
    PaymentStatusUpdate,
    PlatformStatsOut,
    RegistrationAdminOut,
    WaitlistPromoteResponse,
)
from ..registration_lifecycle import InvalidStatusTransitionError
from ..repositories import camps as camps_repo
from ..repositories import organizations as organizations_repo
from ..repositories import platform_roles
from ..repositories import platform_stats as platform_stats_repo
from ..repositories import registrations as registrations_repo
from ..repositories.camps import CampSlugConflictError
from ..repositories.organizations import OrganizationSlugConflictError
from ..repositories.registrations import RegistrationNotFoundError
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/me", response_model=MeOut)
def get_me(auth: AuthContext = Depends(get_auth_context)) -> MeOut:
    """Who am I, and what can I see — the frontend calls this once after
    login to decide whether to render the CEO console or a single-org
    admin view. Any authenticated user gets a response (even one with zero
    permissions); this endpoint itself has no owner/org_admin gate."""
    admin_slugs: list[str] = []
    if not auth.is_owner:
        for organization_id in auth.admin_organization_ids:
            organization = organizations_repo.get_organization_by_id(organization_id)
            if organization is not None:
                admin_slugs.append(organization["slug"])
    return MeOut(
        user_id=auth.user_id,
        email=auth.email,
        is_platform_owner=auth.is_owner,
        admin_organization_slugs=admin_slugs,
    )


@router.get(
    "/organizations",
    response_model=list[OrganizationAdminListItem],
    dependencies=[Depends(require_platform_owner)],
)
def list_organizations() -> list[OrganizationAdminListItem]:
    """Every organization regardless of plan_status, for the platform
    console's tenant list — platform_owner only (an org_admin has no
    business seeing organizations they don't administer, even just their
    names/slugs)."""
    rows = organizations_repo.list_organizations()
    return [OrganizationAdminListItem.model_validate(row) for row in rows]


@router.get(
    "/organizations/{organization_slug}",
    response_model=OrganizationAdminOut,
)
def get_organization(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> OrganizationAdminOut:
    """Single-organization admin detail — powers the platform console's
    Vereinsdetailseite (setup-progress checklist) and the operator preview
    of an unpublished (draft) organization's public page, which the public
    GET /api/v1/organizations/{slug} endpoint would 404 on by design (see
    tenancy.py's site_published check). platform_owner or that
    organization's own org_admin."""
    organization = require_organization(organization_slug)
    return OrganizationAdminOut.model_validate(organization)


@router.post(
    "/organizations",
    response_model=OrganizationAdminOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_platform_owner)],
)
def create_organization(data: OrganizationCreate, auth: AuthContext = Depends(require_platform_owner)) -> OrganizationAdminOut:
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
)
def update_organization(
    organization_slug: str, data: OrganizationUpdate, auth: AuthContext = Depends(require_org_access)
) -> OrganizationAdminOut:
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
        platform_roles.write_audit_log(
            actor_user_id=auth.user_id,
            actor_email=auth.email,
            action="organization.publish_state_changed",
            organization_id=str(row["id"]),
            target_type="organization",
            target_id=organization_slug,
            metadata={"site_published": row["site_published"]},
        )
    logger.info("Organization updated (slug=%s)", organization_slug)
    return OrganizationAdminOut.model_validate(row)


@router.post(
    "/organizations/{organization_slug}/camps",
    response_model=CampAdminOut,
    status_code=status.HTTP_201_CREATED,
)
def create_camp(
    organization_slug: str, data: CampCreate, auth: AuthContext = Depends(require_org_access)
) -> CampAdminOut:
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
)
def update_camp(
    organization_slug: str, camp_slug: str, data: CampUpdate, auth: AuthContext = Depends(require_org_access)
) -> CampAdminOut:
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

    if data.model_fields_set and "status" in data.model_fields_set:
        platform_roles.write_audit_log(
            actor_user_id=auth.user_id,
            actor_email=auth.email,
            action="camp.status_changed",
            organization_id=str(organization["id"]),
            target_type="camp",
            target_id=camp_slug,
            metadata={"status": row["status"]},
        )
    logger.info("Camp updated (organization_slug=%s, camp_slug=%s)", organization_slug, camp_slug)
    return CampAdminOut.model_validate(row)


@router.get(
    "/organizations/{organization_slug}/camps",
    response_model=list[CampAdminOut],
)
def list_camps(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> list[CampAdminOut]:
    """Every camp for this org regardless of status — unlike the public
    GET /api/v1/.../camps, which only ever returns published ones. Powers
    the Organisation-Dashboard's "Alle Camps" block."""
    organization = require_organization(organization_slug)

    rows = camps_repo.list_camps_for_organization(organization["id"])
    return [CampAdminOut.model_validate(row) for row in rows]


@router.get(
    "/organizations/{organization_slug}/camps/{camp_slug}/registrations",
    response_model=list[RegistrationAdminOut],
)
def list_registrations(
    organization_slug: str, camp_slug: str, auth: AuthContext = Depends(require_org_access)
) -> list[RegistrationAdminOut]:
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
)
def promote_waitlist(
    organization_slug: str, camp_slug: str, auth: AuthContext = Depends(require_org_access)
) -> WaitlistPromoteResponse:
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
)
def cancel_registration(
    organization_slug: str, camp_slug: str, registration_token: UUID, auth: AuthContext = Depends(require_org_access)
) -> CancelRegistrationResponse:
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
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action="registration.cancelled",
        organization_id=str(organization["id"]),
        target_type="registration",
        target_id=str(registration_token),
        metadata={"promoted": result["promoted"] is not None},
    )
    return CancelRegistrationResponse(**result)


@router.patch(
    "/organizations/{organization_slug}/camps/{camp_slug}/registrations/{registration_token}/payment-status",
    response_model=RegistrationAdminOut,
)
def update_registration_payment_status(
    organization_slug: str,
    camp_slug: str,
    registration_token: UUID,
    data: PaymentStatusUpdate,
    auth: AuthContext = Depends(require_org_access),
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
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action="registration.payment_status_changed",
        organization_id=str(organization["id"]),
        target_type="registration",
        target_id=str(registration_token),
        metadata={"payment_status": data.payment_status},
    )
    return RegistrationAdminOut.model_validate(row)


# --- CEO-console-only endpoints (feat/platform-foundation) ---------------
# Everything below is platform_owner-only: cross-organization visibility
# (stats, global registrations, audit log) or platform-level actions
# (assigning who administers an organization). An org_admin never reaches
# any of these, even for their own organization — "who else can manage my
# org" is a platform-owner decision, not a self-service one, same
# reasoning as why org creation itself is owner-only.


@router.get(
    "/stats",
    response_model=PlatformStatsOut,
    dependencies=[Depends(require_platform_owner)],
)
def get_platform_stats() -> PlatformStatsOut:
    """CEO console overview counters — see repositories/platform_stats.py
    for the single aggregate query behind this."""
    return PlatformStatsOut.model_validate(platform_stats_repo.get_platform_stats())


@router.get(
    "/registrations",
    response_model=list[GlobalRegistrationOut],
    dependencies=[Depends(require_platform_owner)],
)
def list_registrations_global(
    organization_slug: str | None = None,
    camp_slug: str | None = None,
    registration_status: str | None = None,
) -> list[GlobalRegistrationOut]:
    """Cross-organization registrations view for the CEO console, filterable
    by organization/camp/status — see
    registrations_repo.list_registrations_global's docstring for why this
    is safe only behind require_platform_owner. Query param is named
    `registration_status` (not `status`) to avoid colliding with FastAPI's
    reserved handling of a bare `status` name in some client generators."""
    rows = registrations_repo.list_registrations_global(
        organization_slug=organization_slug, camp_slug=camp_slug, status=registration_status
    )
    return [GlobalRegistrationOut.model_validate(row) for row in rows]


@router.get(
    "/audit-log",
    response_model=list[AuditLogEntryOut],
    dependencies=[Depends(require_platform_owner)],
)
def get_audit_log(organization_slug: str | None = None) -> list[AuditLogEntryOut]:
    organization_id = None
    if organization_slug:
        organization_id = str(require_organization(organization_slug)["id"])
    rows = platform_roles.list_audit_log(organization_id=organization_id)
    for row in rows:
        if row.get("actor_user_id") is not None:
            row["actor_user_id"] = str(row["actor_user_id"])
    return [AuditLogEntryOut.model_validate(row) for row in rows]


@router.get(
    "/organizations/{organization_slug}/members",
    response_model=list[OrganizationMemberOut],
)
def list_organization_members(
    organization_slug: str, auth: AuthContext = Depends(require_org_access)
) -> list[OrganizationMemberOut]:
    """Owner or that organization's own org_admin can see who else has
    access to it — a member managing their own organization reasonably
    needs to know who else can too, even though *assigning* a new one
    stays owner-only (see add_organization_member below)."""
    organization = require_organization(organization_slug)
    rows = platform_roles.list_organization_members(organization["id"])
    return [OrganizationMemberOut.model_validate({**row, "user_id": str(row["user_id"]), "email": None}) for row in rows]


@router.post(
    "/organizations/{organization_slug}/members",
    response_model=OrganizationMemberOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_platform_owner)],
)
def add_organization_member(
    organization_slug: str, data: AddOrganizationMemberRequest, auth: AuthContext = Depends(require_platform_owner)
) -> OrganizationMemberOut:
    """Assigns an *existing* Supabase Auth account (looked up by email via
    the Admin API) as org_admin for this organization. Deliberately not an
    invite flow — no email is sent (out of scope for this sprint, see
    app/supabase_auth.py::find_user_by_email). The account must already
    exist; create one with scripts/create_platform_user.py first."""
    organization = require_organization(organization_slug)

    try:
        user = supabase_auth.find_user_by_email(data.email)
    except SupabaseAuthError as exc:
        logger.warning("Could not look up user by email for member assignment: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="User lookup unavailable — SUPABASE_SERVICE_ROLE_KEY not configured or Supabase Auth unreachable",
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account exists for this email yet — create one first (scripts/create_platform_user.py)",
        )

    row = platform_roles.add_organization_member(organization["id"], user.id, role="org_admin")
    logger.info("Organization member assigned (organization_slug=%s, role=org_admin)", organization_slug)
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action="organization.member_assigned",
        organization_id=str(organization["id"]),
        target_type="organization_member",
        target_id=user.id,
        metadata={"email": data.email, "role": "org_admin"},
    )
    return OrganizationMemberOut.model_validate({**row, "user_id": str(row["user_id"]), "email": user.email})


@router.delete(
    "/organizations/{organization_slug}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_platform_owner)],
)
def remove_organization_member(
    organization_slug: str, member_id: UUID, auth: AuthContext = Depends(require_platform_owner)
) -> None:
    organization = require_organization(organization_slug)
    removed = platform_roles.remove_organization_member(organization["id"], str(member_id))
    if not removed:
        raise HTTPException(status_code=404, detail="Membership not found")
    logger.info("Organization member removed (organization_slug=%s)", organization_slug)
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action="organization.member_removed",
        organization_id=str(organization["id"]),
        target_type="organization_member",
        target_id=str(member_id),
    )
