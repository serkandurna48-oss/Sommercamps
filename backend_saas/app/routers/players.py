"""
Admin API for player records (Spielerakte): players, internal training notes,
goals and measurements.

Child data (performance and mental notes): admin only (`require_org_access`),
organization resolved from the slug server-side, every repository call filters
organization_id and player_id, so foreign ids are plain 404s. Nothing from a
record (names, note text, links) goes into logs, audit metadata or error
responses: audit entries carry the action, the record id and the player id only;
validation errors name the field, never the value. Request bodies are parsed
manually (not via pydantic models) so that FastAPI's default 422 body, which
echoes the offending input, can never leak note text.

Notes: `camp_id` (optional) must belong to the same organization. The player
does NOT need a booking for it (a session can be documented for a child that
attended without booking).
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_org_access
from ..repositories import platform_roles
from ..repositories import players as repo
from ..repositories.training import BERLIN

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin Players"])

_BASE = "/organizations/{organization_slug}/players"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ---------------------------------------------------------------- schemas (responses)

class PlayerSummaryOut(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    birth_date: date
    age: int
    last_booking_at: Optional[date] = None  # start date of the latest non-cancelled booking
    booking_count: int
    note_count: int
    open_goal_count: int
    is_member: bool = False  # active club member (same match_key + birth date)


class PlayerOut(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    birth_date: date
    age: int
    is_member: bool = False  # active club member (same match_key + birth date)


class BookingOut(BaseModel):
    registration_id: UUID
    camp_id: UUID
    kind: str  # "training" (single session of an offer) or "camp"
    camp_title: str
    offer_title: Optional[str] = None
    local_date: str  # YYYY-MM-DD, Europe/Berlin for training sessions
    local_time: Optional[str] = None  # HH:MM Europe/Berlin, only for training sessions
    status: str
    payment_status: str
    documentation_consent: Optional[bool] = None


class NoteOut(BaseModel):
    id: UUID
    player_id: UUID
    camp_id: Optional[UUID] = None
    note_date: date
    focus: list[str]
    body: str
    rating: Optional[int] = None
    next_steps: Optional[str] = None
    video_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class GoalOut(BaseModel):
    id: UUID
    player_id: UUID
    title: str
    area: str
    status: str
    target_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class MeasurementOut(BaseModel):
    id: UUID
    player_id: UUID
    measured_on: date
    metric: str
    value: float
    unit: str
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MetricOut(BaseModel):
    metric: str
    unit: str


class PlayerDetailOut(BaseModel):
    player: PlayerOut
    bookings: list[BookingOut]
    notes: list[NoteOut]  # newest first (note_date desc, created_at desc)
    goals: list[GoalOut]
    measurements: list[MeasurementOut]  # newest first (measured_on desc)
    metrics: list[MetricOut]  # standard metrics with their fixed units


# ---------------------------------------------------------------- helpers

def _invalid(field: str, reason: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"code": "validation_error", "field": field, "reason": reason})


async def _json_body(request: Request) -> dict:
    """Parses the JSON object body without ever echoing it in an error."""
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001 - malformed JSON / encoding
        raise HTTPException(status_code=422, detail={"code": "invalid_body"}) from None
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail={"code": "invalid_body"})
    return data


def _parse_date(field: str, value: Any, *, nullable: bool) -> Optional[date]:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not _DATE_RE.match(value):
        raise _invalid(field, "must be a date (YYYY-MM-DD)")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise _invalid(field, "must be a date (YYYY-MM-DD)") from None


def _prepare(data: dict, *, dates: dict[str, bool], uuids: tuple[str, ...] = ()) -> dict:
    """Converts date/UUID strings; everything else is validated by the repository."""
    out = dict(data)
    for field, nullable in dates.items():
        if field in out:
            out[field] = _parse_date(field, out[field], nullable=nullable)
    for field in uuids:
        if field in out and out[field] is not None:
            try:
                if not isinstance(out[field], str):
                    raise ValueError
                out[field] = UUID(out[field])
            except ValueError:
                raise _invalid(field, "must be an id") from None
    return out


def _call(func, *args, **fields):
    """Runs a repository write; maps validation/reference errors to 422 (field only)."""
    try:
        return func(*args, **fields)
    except repo.PlayerValidationError as exc:
        raise _invalid(exc.field, exc.reason) from None
    except repo.PlayerReferenceError:
        raise _invalid("camp_id", "unknown reference") from None
    except repo.PlayerNotFoundError:
        raise HTTPException(status_code=404, detail="Player not found") from None


def _audit(auth: AuthContext, organization: dict, action: str, target_type: str, target_id: Any, player_id: Any) -> None:
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action=action,
        organization_id=str(organization["id"]), target_type=target_type, target_id=str(target_id),
        metadata={"player_id": str(player_id)},
    )


def _player_or_404(organization: dict, player_id: UUID) -> dict:
    player = repo.get_player(organization["id"], player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


def _booking(row: dict) -> BookingOut:
    if row["offer_id"] is not None and row["starts_at"] is not None:
        local = row["starts_at"].astimezone(timezone.utc).astimezone(BERLIN)
        kind, local_date, local_time = "training", f"{local:%Y-%m-%d}", f"{local:%H:%M}"
    else:
        kind, local_date, local_time = "camp", f"{row['start_date']:%Y-%m-%d}", None
    return BookingOut(
        registration_id=row["registration_id"], camp_id=row["camp_id"], kind=kind,
        camp_title=row["camp_title"], offer_title=row["offer_title"], local_date=local_date,
        local_time=local_time, status=row["status"], payment_status=row["payment_status"],
        documentation_consent=row["documentation_consent"],
    )


def _booking_sort_key(item: BookingOut) -> tuple:
    return (item.local_date, item.local_time or "")


def _measurement(row: dict) -> MeasurementOut:
    return MeasurementOut(**{**row, "value": float(row["value"] if isinstance(row["value"], Decimal) else row["value"])})


# ---------------------------------------------------------------- players

@router.get(_BASE, response_model=list[PlayerSummaryOut])
def list_players(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> list[PlayerSummaryOut]:
    """All players of the organization, ordered by last/first name. No server-side search (client filters)."""
    organization = require_organization(organization_slug)
    return [
        PlayerSummaryOut(**{**r, "last_booking_at": r["last_booking_date"]})
        for r in repo.list_players(organization["id"])
    ]


@router.get(_BASE + "/{player_id}", response_model=PlayerDetailOut)
def get_player(organization_slug: str, player_id: UUID, auth: AuthContext = Depends(require_org_access)) -> PlayerDetailOut:
    organization = require_organization(organization_slug)
    org_id = organization["id"]
    player = _player_or_404(organization, player_id)
    bookings = sorted((_booking(r) for r in repo.list_player_bookings(org_id, player_id)),
                      key=_booking_sort_key, reverse=True)
    return PlayerDetailOut(
        player=PlayerOut(**player),
        bookings=bookings,
        notes=[NoteOut(**r) for r in repo.list_notes(org_id, player_id)],
        goals=[GoalOut(**r) for r in repo.list_goals(org_id, player_id)],
        measurements=[_measurement(r) for r in repo.list_measurements(org_id, player_id)],
        metrics=[MetricOut(metric=k, unit=v) for k, v in repo.STANDARD_METRICS.items()],
    )


# ---------------------------------------------------------------- notes

_NOTE_DATES = {"note_date": False}


@router.post(_BASE + "/{player_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(
    organization_slug: str, player_id: UUID, auth: AuthContext = Depends(require_org_access), data: dict = Depends(_json_body),
) -> dict:
    organization = require_organization(organization_slug)
    _player_or_404(organization, player_id)
    fields = _prepare(data, dates=_NOTE_DATES, uuids=("camp_id",))
    if "note_date" not in fields:
        raise _invalid("note_date", "required")
    row = _call(repo.create_note, organization["id"], player_id, **fields)
    _audit(auth, organization, "player_note.created", "player_note", row["id"], player_id)
    return row


@router.patch(_BASE + "/{player_id}/notes/{note_id}", response_model=NoteOut)
def update_note(
    organization_slug: str, player_id: UUID, note_id: UUID, auth: AuthContext = Depends(require_org_access), data: dict = Depends(_json_body),
) -> dict:
    organization = require_organization(organization_slug)
    fields = _prepare(data, dates=_NOTE_DATES, uuids=("camp_id",))
    row = _call(repo.update_note, organization["id"], player_id, note_id, **fields)
    if row is None:
        raise HTTPException(status_code=404, detail="Note not found")
    _audit(auth, organization, "player_note.updated", "player_note", note_id, player_id)
    return row


@router.delete(_BASE + "/{player_id}/notes/{note_id}", status_code=204)
def delete_note(
    organization_slug: str, player_id: UUID, note_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> Response:
    organization = require_organization(organization_slug)
    if not repo.delete_note(organization["id"], player_id, note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    _audit(auth, organization, "player_note.deleted", "player_note", note_id, player_id)
    return Response(status_code=204)


# ---------------------------------------------------------------- goals

_GOAL_DATES = {"target_date": True}


@router.post(_BASE + "/{player_id}/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    organization_slug: str, player_id: UUID, auth: AuthContext = Depends(require_org_access), data: dict = Depends(_json_body),
) -> dict:
    organization = require_organization(organization_slug)
    _player_or_404(organization, player_id)
    row = _call(repo.create_goal, organization["id"], player_id, **_prepare(data, dates=_GOAL_DATES))
    _audit(auth, organization, "player_goal.created", "player_goal", row["id"], player_id)
    return row


@router.patch(_BASE + "/{player_id}/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    organization_slug: str, player_id: UUID, goal_id: UUID, auth: AuthContext = Depends(require_org_access), data: dict = Depends(_json_body),
) -> dict:
    organization = require_organization(organization_slug)
    row = _call(repo.update_goal, organization["id"], player_id, goal_id, **_prepare(data, dates=_GOAL_DATES))
    if row is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    _audit(auth, organization, "player_goal.updated", "player_goal", goal_id, player_id)
    return row


@router.delete(_BASE + "/{player_id}/goals/{goal_id}", status_code=204)
def delete_goal(
    organization_slug: str, player_id: UUID, goal_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> Response:
    organization = require_organization(organization_slug)
    if not repo.delete_goal(organization["id"], player_id, goal_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    _audit(auth, organization, "player_goal.deleted", "player_goal", goal_id, player_id)
    return Response(status_code=204)


# ---------------------------------------------------------------- measurements

_MEASUREMENT_DATES = {"measured_on": False}


@router.post(_BASE + "/{player_id}/measurements", response_model=MeasurementOut, status_code=status.HTTP_201_CREATED)
def create_measurement(
    organization_slug: str, player_id: UUID, auth: AuthContext = Depends(require_org_access), data: dict = Depends(_json_body),
) -> MeasurementOut:
    organization = require_organization(organization_slug)
    _player_or_404(organization, player_id)
    fields = _prepare(data, dates=_MEASUREMENT_DATES)
    if "measured_on" not in fields:
        raise _invalid("measured_on", "required")
    row = _call(repo.create_measurement, organization["id"], player_id, **fields)
    _audit(auth, organization, "player_measurement.created", "player_measurement", row["id"], player_id)
    return _measurement(row)


@router.patch(_BASE + "/{player_id}/measurements/{measurement_id}", response_model=MeasurementOut)
def update_measurement(
    organization_slug: str, player_id: UUID, measurement_id: UUID, auth: AuthContext = Depends(require_org_access), data: dict = Depends(_json_body),
) -> MeasurementOut:
    organization = require_organization(organization_slug)
    row = _call(repo.update_measurement, organization["id"], player_id, measurement_id,
                **_prepare(data, dates=_MEASUREMENT_DATES))
    if row is None:
        raise HTTPException(status_code=404, detail="Measurement not found")
    _audit(auth, organization, "player_measurement.updated", "player_measurement", measurement_id, player_id)
    return _measurement(row)


@router.delete(_BASE + "/{player_id}/measurements/{measurement_id}", status_code=204)
def delete_measurement(
    organization_slug: str, player_id: UUID, measurement_id: UUID, auth: AuthContext = Depends(require_org_access)
) -> Response:
    organization = require_organization(organization_slug)
    if not repo.delete_measurement(organization["id"], player_id, measurement_id):
        raise HTTPException(status_code=404, detail="Measurement not found")
    _audit(auth, organization, "player_measurement.deleted", "player_measurement", measurement_id, player_id)
    return Response(status_code=204)
