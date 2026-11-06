"""Training offers and sessions (Stufe 1, Task 4).

Admin: org-scoped (`require_org_access`), organization resolved from the slug
server-side, every repository call filters organization_id; offer/session ids
from the URL are always looked up *within* that organization (and, for
sessions, within the offer in the path), so foreign ids are plain 404s.
Public: published offers and their future published sessions only, no
participant data.

A session is a `camps` row with offer_id set. Sessions created through this
API are `published` by default (bookable as soon as the offer is published);
pass status "draft" to prepare one silently. Bookability additionally needs
the offer itself to be published (see registrations repository).
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..admin_resolve import require_organization
from ..admin_schemas import RegistrationAdminOut, _validate_slug
from ..registration_lifecycle import CAPACITY_COUNTING_STATUSES
from ..schemas import RegistrationCreated
from ..auth_deps import AuthContext, require_org_access
from ..deps import get_tenant_context
from ..repositories import camps as camps_repo
from ..repositories import platform_roles
from ..repositories import registrations as registrations_repo
from ..repositories import training as repo
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/admin", tags=["Admin Training"])
public_router = APIRouter(prefix="/api/v1/organizations/{organization_slug}/training-offers", tags=["Training"])

OfferKind = Literal["einzel", "gruppe"]
OfferStatus = Literal["draft", "published", "archived"]
OfferCategory = Literal["fussball", "athletik", "mental", "videoanalyse", "premium"]
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


# ---------------------------------------------------------------- schemas

class OfferCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    slug: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    kind: OfferKind
    description: Optional[str] = Field(default=None, max_length=5000)
    duration_minutes: int = Field(ge=1, le=600)
    location: Optional[str] = Field(default=None, max_length=300)
    price_member_cents: int = Field(ge=0, le=10_000_000)
    price_nonmember_cents: int = Field(ge=0, le=10_000_000)
    status: OfferStatus = "draft"
    category: Optional[OfferCategory] = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str) -> str:
        return _validate_slug(value)


class OfferUpdate(BaseModel):
    """Slug and kind are immutable (public URL / booking rules)."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    location: Optional[str] = Field(default=None, max_length=300)
    price_member_cents: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    price_nonmember_cents: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    status: Optional[OfferStatus] = None
    category: Optional[OfferCategory] = None  # null clears

    @model_validator(mode="after")
    def _no_null_for_required(self) -> "OfferUpdate":
        for name in ("title", "duration_minutes", "price_member_cents", "price_nonmember_cents", "status"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} must not be null")
        return self


class OfferAdminOut(BaseModel):
    id: UUID
    slug: str
    title: str
    kind: str
    description: Optional[str] = None
    duration_minutes: int
    location: Optional[str] = None
    price_member_cents: int
    price_nonmember_cents: int
    status: str
    category: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OfferPublicOut(BaseModel):
    slug: str
    title: str
    kind: str
    description: Optional[str] = None
    duration_minutes: int
    location: Optional[str] = None
    price_member_cents: int
    price_nonmember_cents: int
    category: Optional[str] = None


class OfferListPublicOut(OfferPublicOut):
    # The offer prices above are only the template for NEW sessions; booking charges the
    # frozen session prices. These are the lowest of the upcoming sessions ("ab" prices),
    # null when the offer has no bookable session.
    from_price_member_cents: Optional[int] = None
    from_price_nonmember_cents: Optional[int] = None


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date  # local calendar date, Europe/Berlin
    start_time: str  # "HH:MM" local time, Europe/Berlin
    capacity: Optional[int] = Field(default=None, ge=1, le=8)
    age_min: int = Field(default=4, ge=0, le=99)
    age_max: int = Field(default=18, ge=0, le=99)
    status: Literal["draft", "published"] = "published"

    @field_validator("start_time")
    @classmethod
    def _start_time(cls, value: str) -> str:
        if not _TIME_RE.match(value):
            raise ValueError("start_time must be HH:MM")
        return value

    @model_validator(mode="after")
    def _ages(self) -> "SessionCreate":
        if self.age_max < self.age_min:
            raise ValueError("age_max must be >= age_min")
        return self


class SessionSeriesCreate(BaseModel):
    """Weekly series: `weeks` sessions on the weekday of start_date, same Berlin local time."""

    model_config = ConfigDict(extra="forbid")

    start_date: date  # local calendar date of the first session, Europe/Berlin
    start_time: str  # "HH:MM" local time, Europe/Berlin
    weeks: int = Field(ge=1, le=12)
    capacity: Optional[int] = Field(default=None, ge=1, le=8)
    age_min: int = Field(default=4, ge=0, le=99)
    age_max: int = Field(default=18, ge=0, le=99)
    status: Literal["draft", "published"] = "published"

    @field_validator("start_time")
    @classmethod
    def _start_time(cls, value: str) -> str:
        if not _TIME_RE.match(value):
            raise ValueError("start_time must be HH:MM")
        return value

    @model_validator(mode="after")
    def _ages(self) -> "SessionSeriesCreate":
        if self.age_max < self.age_min:
            raise ValueError("age_max must be >= age_min")
        return self


class SessionSeriesOut(BaseModel):
    created: int
    sessions: list["SessionAdminOut"]


class SessionAdminOut(BaseModel):
    id: UUID
    offer_id: UUID
    slug: str  # session slug: use it with the existing /camps/{slug}/registrations... admin routes
    status: str
    starts_at: datetime  # UTC
    ends_at: datetime  # UTC
    local_date: str  # Europe/Berlin, YYYY-MM-DD
    local_time: str  # Europe/Berlin, HH:MM
    capacity: int
    booked_count: int
    free_spots: int
    price_member_cents: Optional[int] = None
    price_nonmember_cents: int
    age_min: int
    age_max: int
    location: Optional[str] = None


class SessionWithRegistrationsOut(SessionAdminOut):
    registrations: list[RegistrationAdminOut]


class OfferOverviewOut(BaseModel):
    """Offer detail page in one request: offer, its sessions with counts, and
    each session's registrations (same rows/shape as the per-session list)."""

    offer: OfferAdminOut
    sessions: list[SessionWithRegistrationsOut]


class TrainingPaymentOfferOut(BaseModel):
    id: UUID
    title: str
    kind: str
    status: str


class TrainingPaymentRegistrationOut(RegistrationCreated):
    """Payment-relevant subset of RegistrationAdminOut (no medical, emergency,
    birth-date or free-text answers). payment_reference is computed from the
    session title exactly as on the per-session list."""

    id: UUID
    payment_method: Optional[str] = None
    member_match: Optional[bool] = None
    parent_first_name: str
    parent_last_name: str
    parent_email: str
    child_first_name: str
    child_last_name: str
    created_at: datetime


class TrainingPaymentGroupOut(BaseModel):
    offer: TrainingPaymentOfferOut
    session: SessionAdminOut
    registrations: list[TrainingPaymentRegistrationOut]


class SessionPublicOut(BaseModel):
    slug: str  # booking: POST /api/v1/organizations/{org}/camps/{slug}/registrations
    starts_at: datetime  # UTC
    ends_at: datetime  # UTC
    local_date: str
    local_time: str
    capacity: int
    free_spots: int
    price_member_cents: Optional[int] = None
    price_nonmember_cents: int
    age_min: int
    age_max: int


class OfferDetailPublicOut(OfferPublicOut):
    sessions: list[SessionPublicOut]


# ---------------------------------------------------------------- helpers

def _times(row: dict) -> dict:
    starts = row["starts_at"].astimezone(timezone.utc)
    ends = row["ends_at"].astimezone(timezone.utc)
    local = starts.astimezone(repo.BERLIN)
    return {"starts_at": starts, "ends_at": ends,
            "local_date": f"{local:%Y-%m-%d}", "local_time": f"{local:%H:%M}"}


def _session_admin(row: dict) -> SessionAdminOut:
    return SessionAdminOut(
        id=row["id"], offer_id=row["offer_id"], slug=row["slug"], status=row["status"],
        capacity=row["capacity"], booked_count=row["booked_count"],
        free_spots=max(0, row["capacity"] - row["booked_count"]),
        price_member_cents=row["price_member_cents"], price_nonmember_cents=row["price_cents"],
        age_min=row["age_min"], age_max=row["age_max"], location=row["location"], **_times(row),
    )


def _session_public(row: dict) -> SessionPublicOut:
    return SessionPublicOut(
        slug=row["slug"], capacity=row["capacity"],
        free_spots=max(0, row["capacity"] - row["booked_count"]),
        price_member_cents=row["price_member_cents"], price_nonmember_cents=row["price_cents"],
        age_min=row["age_min"], age_max=row["age_max"], **_times(row),
    )


def _berlin_start(day: date, hhmm: str) -> datetime:
    hour, minute = int(hhmm[:2]), int(hhmm[3:])
    naive = datetime(day.year, day.month, day.day, hour, minute)
    first = naive.replace(tzinfo=repo.BERLIN, fold=0)
    if first.astimezone(timezone.utc).astimezone(repo.BERLIN).replace(tzinfo=None) != naive:
        raise HTTPException(status_code=422, detail="This local time does not exist (daylight saving change)")
    second = naive.replace(tzinfo=repo.BERLIN, fold=1)
    if second.utcoffset() != first.utcoffset():
        raise HTTPException(status_code=422, detail="This local time is ambiguous (daylight saving change)")
    return first.astimezone(timezone.utc)


def _audit(auth: AuthContext, organization: dict, action: str, target_type: str, target_id: str, metadata: dict) -> None:
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action=action,
        organization_id=str(organization["id"]), target_type=target_type, target_id=target_id,
        metadata=metadata,
    )


def _offer_or_404(organization: dict, offer_id: UUID) -> dict:
    offer = repo.get_offer(organization["id"], offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


def _session_or_404(organization: dict, offer_id: UUID, session_id: UUID) -> dict:
    row = repo.get_session_with_count(organization["id"], offer_id, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return row


# ------------------------------------------------------------ admin: offers

_ADMIN = "/organizations/{organization_slug}/training-offers"


@admin_router.get(_ADMIN, response_model=list[OfferAdminOut])
def list_offers(
    organization_slug: str, status: Optional[OfferStatus] = None, auth: AuthContext = Depends(require_org_access)
) -> list[dict]:
    organization = require_organization(organization_slug)
    return repo.list_offers(organization["id"], status=status)


@admin_router.post(_ADMIN, response_model=OfferAdminOut, status_code=201)
def create_offer(
    organization_slug: str, data: OfferCreate, auth: AuthContext = Depends(require_org_access)
) -> dict:
    organization = require_organization(organization_slug)
    try:
        row = repo.create_offer(organization["id"], **data.model_dump())
    except repo.TrainingOfferSlugConflictError:
        raise HTTPException(status_code=409, detail="Slug already in use") from None
    logger.info("Training offer created (organization_slug=%s, offer_slug=%s)", organization_slug, data.slug)
    _audit(auth, organization, "training_offer.created", "training_offer", str(row["id"]), {"status": row["status"]})
    return row


@admin_router.get(_ADMIN + "/{offer_id}", response_model=OfferAdminOut)
def get_offer(organization_slug: str, offer_id: UUID, auth: AuthContext = Depends(require_org_access)) -> dict:
    return _offer_or_404(require_organization(organization_slug), offer_id)


@admin_router.patch(_ADMIN + "/{offer_id}", response_model=OfferAdminOut)
def update_offer(
    organization_slug: str, offer_id: UUID, data: OfferUpdate, auth: AuthContext = Depends(require_org_access)
) -> dict:
    organization = require_organization(organization_slug)
    row = repo.update_offer(organization["id"], offer_id, **data.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    logger.info("Training offer updated (organization_slug=%s)", organization_slug)
    _audit(auth, organization, "training_offer.updated", "training_offer", str(row["id"]),
           {"fields": sorted(data.model_fields_set), "status": row["status"]})
    return row


# ---------------------------------------------------------- admin: sessions

@admin_router.get(_ADMIN + "/{offer_id}/sessions", response_model=list[SessionAdminOut])
def list_sessions(
    organization_slug: str, offer_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> list[SessionAdminOut]:
    organization = require_organization(organization_slug)
    _offer_or_404(organization, offer_id)
    return [_session_admin(r) for r in repo.list_sessions_with_counts(organization["id"], offer_id)]


@admin_router.post(_ADMIN + "/{offer_id}/sessions", response_model=SessionAdminOut, status_code=201)
def create_session(
    organization_slug: str, offer_id: UUID, data: SessionCreate, auth: AuthContext = Depends(require_org_access)
) -> SessionAdminOut:
    organization = require_organization(organization_slug)
    _offer_or_404(organization, offer_id)
    starts_at = _berlin_start(data.date, data.start_time)
    try:
        row = repo.create_session(
            organization["id"], offer_id, starts_at, capacity=data.capacity,
            age_min=data.age_min, age_max=data.age_max, status=data.status,
        )
    except camps_repo.CampSlugConflictError:
        raise HTTPException(status_code=409, detail="A session at this time already exists") from None
    except repo.TrainingOfferNotFoundError:
        raise HTTPException(status_code=404, detail="Offer not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    logger.info("Training session created (organization_slug=%s)", organization_slug)
    _audit(auth, organization, "training_session.created", "training_session", str(row["id"]),
           {"status": row["status"]})
    return _session_admin(_session_or_404(organization, offer_id, row["id"]))


@admin_router.post(_ADMIN + "/{offer_id}/sessions/series", response_model=SessionSeriesOut, status_code=201)
def create_session_series(
    organization_slug: str, offer_id: UUID, data: SessionSeriesCreate, auth: AuthContext = Depends(require_org_access)
) -> SessionSeriesOut:
    """Weekly series, all or none. Each week keeps the same Berlin wall-clock time (DST-correct);
    a gap/ambiguous local time in any week rejects the whole series (422), an existing slug gives 409."""
    organization = require_organization(organization_slug)
    _offer_or_404(organization, offer_id)
    starts = [_berlin_start(data.start_date + timedelta(weeks=i), data.start_time) for i in range(data.weeks)]
    try:
        rows = repo.create_sessions(
            organization["id"], offer_id, starts, capacity=data.capacity,
            age_min=data.age_min, age_max=data.age_max, status=data.status,
        )
    except camps_repo.CampSlugConflictError:
        raise HTTPException(status_code=409, detail={"code": "session_exists"}) from None
    except repo.TrainingOfferNotFoundError:
        raise HTTPException(status_code=404, detail="Offer not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    logger.info("Training session series created (organization_slug=%s, count=%d)", organization_slug, len(rows))
    _audit(auth, organization, "training_session.series_created", "training_offer", str(offer_id),
           {"count": len(rows), "status": data.status})
    return SessionSeriesOut(
        created=len(rows),
        sessions=[_session_admin(_session_or_404(organization, offer_id, r["id"])) for r in rows],
    )


@admin_router.delete(_ADMIN + "/{offer_id}/sessions/{session_id}", status_code=204)
def delete_session(
    organization_slug: str, offer_id: UUID, session_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> Response:
    organization = require_organization(organization_slug)
    try:
        repo.delete_session(organization["id"], offer_id, session_id)
    except repo.SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found") from None
    except repo.SessionHasRegistrationsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "session_has_active_registrations" if exc.active else "session_has_registration_history"},
        ) from None
    logger.info("Training session deleted (organization_slug=%s)", organization_slug)
    _audit(auth, organization, "training_session.deleted", "training_session", str(session_id), {})
    return Response(status_code=204)


@admin_router.post(_ADMIN + "/{offer_id}/sessions/{session_id}/cancel", response_model=SessionAdminOut)
def cancel_session(
    organization_slug: str, offer_id: UUID, session_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> SessionAdminOut:
    organization = require_organization(organization_slug)
    try:
        repo.cancel_session(organization["id"], offer_id, session_id)
    except repo.SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found") from None
    except repo.SessionHasRegistrationsError:
        raise HTTPException(status_code=409, detail={"code": "session_has_active_registrations"}) from None
    logger.info("Training session cancelled (organization_slug=%s)", organization_slug)
    _audit(auth, organization, "training_session.cancelled", "training_session", str(session_id), {})
    return _session_admin(_session_or_404(organization, offer_id, session_id))


@admin_router.get(
    _ADMIN + "/{offer_id}/sessions/{session_id}/registrations", response_model=list[RegistrationAdminOut]
)
def list_session_registrations(
    organization_slug: str, offer_id: UUID, session_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> list[RegistrationAdminOut]:
    """Same rows/shape as the per-camp admin registration list. Child data: never logged."""
    organization = require_organization(organization_slug)
    _session_or_404(organization, offer_id, session_id)
    rows = registrations_repo.list_registrations_for_camp(organization["id"], session_id)
    return [RegistrationAdminOut.model_validate(r) for r in rows]


# ------------------------------------------------------- admin: aggregates

@admin_router.get(_ADMIN + "/{offer_id}/overview", response_model=OfferOverviewOut)
def get_offer_overview(
    organization_slug: str, offer_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> OfferOverviewOut:
    """Replaces offer + sessions + one registrations request per session
    (2 + N requests) with one. Child data: never logged."""
    organization = require_organization(organization_slug)
    offer = _offer_or_404(organization, offer_id)
    sessions = repo.list_sessions_with_counts(organization["id"], offer_id)
    by_session: dict = {s["id"]: [] for s in sessions}
    for row in registrations_repo.list_registrations_for_offer(organization["id"], offer_id):
        # A registration for a session created between the two queries is
        # skipped; the next load shows it.
        if row["camp_id"] in by_session:
            by_session[row["camp_id"]].append(RegistrationAdminOut.model_validate(row))
    return OfferOverviewOut(
        offer=OfferAdminOut.model_validate(offer),
        sessions=[
            SessionWithRegistrationsOut(**_session_admin(s).model_dump(), registrations=by_session[s["id"]])
            for s in sessions
        ],
    )


@admin_router.get("/organizations/{organization_slug}/training-payments", response_model=list[TrainingPaymentGroupOut])
def list_training_payments(
    organization_slug: str, auth: AuthContext = Depends(require_org_access)
) -> list[TrainingPaymentGroupOut]:
    """Every training session of the organization that has registrations,
    with those registrations (payment fields only), in one query. Groups are
    ordered by offer title, then session start. Draft sessions without an
    active booking are left out (same rule as the payments page had).
    booked_count/free_spots count registered/confirmed rows, as on
    GET .../sessions. Child data: never logged."""
    organization = require_organization(organization_slug)
    groups: dict = {}
    for row in repo.list_training_payment_rows(organization["id"]):
        group = groups.get(row["session_id"])
        if group is None:
            group = groups[row["session_id"]] = {"row": row, "registrations": []}
        group["registrations"].append(row)
    out = []
    for group in groups.values():
        first = group["row"]
        booked = sum(1 for r in group["registrations"] if r["status"] in CAPACITY_COUNTING_STATUSES)
        if first["session_status"] == "draft" and booked == 0:
            continue
        session = _session_admin({
            "id": first["session_id"], "offer_id": first["offer_id"], "slug": first["session_slug"],
            "status": first["session_status"], "capacity": first["capacity"], "booked_count": booked,
            "price_member_cents": first["price_member_cents"], "price_cents": first["price_cents"],
            "age_min": first["age_min"], "age_max": first["age_max"], "location": first["location"],
            "starts_at": first["starts_at"], "ends_at": first["ends_at"],
        })
        out.append(TrainingPaymentGroupOut(
            offer=TrainingPaymentOfferOut(
                id=first["offer_id"], title=first["offer_title"], kind=first["offer_kind"], status=first["offer_status"],
            ),
            session=session,
            registrations=[TrainingPaymentRegistrationOut.model_validate(r) for r in group["registrations"]],
        ))
    return out


# ------------------------------------------------------------------- public

@public_router.get("", response_model=list[OfferListPublicOut])
def list_public_offers(tenant: TenantContext = Depends(get_tenant_context)) -> list[dict]:
    offers = repo.list_offers(tenant.organization_id, status="published")
    lowest = repo.lowest_public_session_prices(tenant.organization_id)
    return [
        {**offer,
         "from_price_member_cents": lowest[offer["id"]][0] if offer["id"] in lowest else None,
         "from_price_nonmember_cents": lowest[offer["id"]][1] if offer["id"] in lowest else None}
        for offer in offers
    ]


@public_router.get("/{offer_slug}", response_model=OfferDetailPublicOut)
def get_public_offer(offer_slug: str, tenant: TenantContext = Depends(get_tenant_context)) -> dict:
    offer = repo.get_offer_by_slug(tenant.organization_id, offer_slug)
    if offer is None or offer["status"] != "published":
        # unknown, draft, archived and other organizations' slugs are indistinguishable
        raise HTTPException(status_code=404, detail="Offer not found")
    sessions = repo.list_public_sessions(tenant.organization_id, offer["id"])
    return {**offer, "sessions": [_session_public(s) for s in sessions]}
