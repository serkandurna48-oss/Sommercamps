"""
Admin API for the club membership list (member vs non-member training price).

Org-scoped like every other admin route: Depends(require_org_access) gates
access, the organization is resolved from the slug server-side and every
repository call filters organization_id. Member data is child data: names and
birth dates are never logged, never put into audit metadata and never echoed
in import error responses (only row number, field name, error code).
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_org_access
from ..membership_csv import MembershipCsvError, parse_membership_csv
from ..repositories import memberships as memberships_repo
from ..repositories import platform_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin Memberships"])

MAX_CSV_CHARS = 1_000_000


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str
    birth_date: date
    member_number: Optional[str]
    active: bool
    source: str
    created_at: datetime


class MemberCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    birth_date: date
    member_number: Optional[str] = Field(default=None, max_length=50)


class MemberActiveUpdate(BaseModel):
    active: bool


class MemberImportIn(BaseModel):
    csv: str


class MemberImportOut(BaseModel):
    rows: int
    created: int
    updated: int
    merged_in_file: int


def _audit(auth: AuthContext, organization: dict, action: str, target_id: Optional[str], metadata: dict) -> None:
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action=action,
        organization_id=str(organization["id"]),
        target_type="organization_membership",
        target_id=target_id,
        metadata=metadata,
    )


@router.get("/organizations/{organization_slug}/club-members", response_model=list[MemberOut])
def list_members(
    organization_slug: str,
    q: Optional[str] = Query(default=None, max_length=100),
    active: Optional[bool] = None,
    auth: AuthContext = Depends(require_org_access),
) -> list[dict]:
    organization = require_organization(organization_slug)
    return memberships_repo.list_members(organization["id"], active=active, search=q)


@router.post(
    "/organizations/{organization_slug}/club-members",
    response_model=MemberOut,
    status_code=status.HTTP_201_CREATED,
)
def create_member(
    organization_slug: str, data: MemberCreate, auth: AuthContext = Depends(require_org_access)
) -> dict:
    organization = require_organization(organization_slug)
    if not data.first_name.strip() or not data.last_name.strip():
        raise HTTPException(status_code=422, detail="Name must not be blank")
    try:
        row = memberships_repo.create_member(
            organization["id"],
            first_name=data.first_name,
            last_name=data.last_name,
            birth_date=data.birth_date,
            member_number=(data.member_number or "").strip() or None,
        )
    except memberships_repo.MembershipConflictError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already exists") from None
    logger.info("Member created (slug=%s)", organization_slug)
    _audit(auth, organization, "membership.created", str(row["id"]), {})
    return row


@router.patch("/organizations/{organization_slug}/club-members/{member_id}", response_model=MemberOut)
def set_member_active(
    organization_slug: str,
    member_id: UUID,
    data: MemberActiveUpdate,
    auth: AuthContext = Depends(require_org_access),
) -> dict:
    organization = require_organization(organization_slug)
    row = memberships_repo.set_member_active(organization["id"], member_id, data.active)
    if row is None:
        raise HTTPException(status_code=404, detail="Member not found")
    logger.info("Member active state changed (slug=%s, active=%s)", organization_slug, data.active)
    _audit(auth, organization, "membership.active_changed", str(row["id"]), {"active": data.active})
    return row


@router.post("/organizations/{organization_slug}/club-members/import", response_model=MemberImportOut)
def import_members(
    organization_slug: str, data: MemberImportIn, auth: AuthContext = Depends(require_org_access)
) -> dict:
    organization = require_organization(organization_slug)
    if len(data.csv) > MAX_CSV_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "import_invalid", "errors": [{"row": 1, "field": "file", "code": "file_too_large"}]},
        )
    try:
        rows = parse_membership_csv(data.csv)
    except MembershipCsvError as exc:
        logger.info("Member import rejected (slug=%s, errors=%d)", organization_slug, len(exc.errors))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "import_invalid", "errors": exc.errors},
        ) from None
    try:
        result = memberships_repo.import_members(organization["id"], rows)
    except Exception:
        logger.exception("Member import failed unexpectedly (slug=%s)", organization_slug)
        raise HTTPException(status_code=500, detail="Import failed, nothing was saved") from None
    logger.info("Member import done (slug=%s, rows=%d)", organization_slug, result["rows"])
    _audit(auth, organization, "memberships.imported", None, result)
    return result
