"""Request/response models for the sales CRM (app/routers/sales.py).

Every request model forbids extra fields: a rep cannot smuggle
owner_user_id, role or created_by into a lead update, and a member
invite cannot carry anything but email, name and one of two roles."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

LeadStatus = Literal["neu", "kontaktiert", "gespraech", "demo", "angebot", "gewonnen", "verloren"]
LeadKind = Literal["verein", "fussballschule", "sonstige"]
SalesRole = Literal["sales_rep", "sales_lead"]


def _http_url(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    if not value.lower().startswith(("http://", "https://")):
        value = "https://" + value
    if any(ch.isspace() for ch in value):
        raise ValueError("Ungültige Web-Adresse")
    if len(value) > 500:  # checked after the prefix: the DB limit is 500
        raise ValueError("Web-Adresse ist zu lang")
    return value


class _LeadFields(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    kind: Optional[LeadKind] = None
    city: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=500)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=60)
    email: Optional[EmailStr] = None
    fit: Optional[Literal["A", "B", "C"]] = None
    source_url: Optional[str] = Field(default=None, max_length=500)
    next_action_at: Optional[date] = None

    @field_validator("website", "source_url")
    @classmethod
    def _urls(cls, value):
        return _http_url(value)

    @field_validator("city", "contact_name", "phone", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


class LeadCreate(_LeadFields):
    name: str = Field(min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=4000)
    # Managers only; ignored (forced to self) for a sales_rep.
    owner_user_id: Optional[UUID] = None


class LeadUpdate(_LeadFields):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[LeadStatus] = None
    note: Optional[str] = Field(default=None, max_length=4000)


class LeadAssign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_user_id: Optional[UUID] = None


class LeadOut(BaseModel):
    id: UUID
    name: str
    kind: str
    city: Optional[str] = None
    website: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    fit: Optional[str] = None
    source_url: Optional[str] = None
    status: str
    owner_user_id: Optional[str] = None
    owner_name: Optional[str] = None
    next_action_at: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class ActivityOut(BaseModel):
    id: UUID
    kind: str
    body: Optional[str] = None
    actor_name: Optional[str] = None
    created_at: datetime


class LeadDetailOut(LeadOut):
    activities: list[ActivityOut] = Field(default_factory=list)


class SalesMeOut(BaseModel):
    user_id: str
    email: Optional[str] = None
    role: Literal["owner", "sales_lead", "sales_rep"]
    can_manage: bool


class SalesMemberOut(BaseModel):
    user_id: str
    email: Optional[str] = None
    role: str
    display_name: str
    active: bool
    created_at: datetime
    invited: Optional[bool] = None
    invite_mail_sent: Optional[bool] = None


class SalesMemberCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    email: EmailStr
    display_name: str = Field(min_length=1, max_length=80)
    role: SalesRole = "sales_rep"


class SalesMemberUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    role: Optional[SalesRole] = None
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    active: Optional[bool] = None


class TeamMemberStats(BaseModel):
    user_id: str
    display_name: str
    role: str
    active: bool
    total: int
    open: int
    won: int
    overdue: int
    by_status: dict[str, int] = Field(default_factory=dict)
    last_activity_at: Optional[datetime] = None


class TeamOverviewOut(BaseModel):
    members: list[TeamMemberStats]
    funnel: dict[str, int]
    unassigned_open: int


class LeadImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    csv: str = Field(min_length=1, max_length=1_000_000)
    dry_run: bool = False


class LeadImportOut(BaseModel):
    created: int
    duplicates: int
    invalid: int
    unknown_columns: list[str]
    dry_run: bool
