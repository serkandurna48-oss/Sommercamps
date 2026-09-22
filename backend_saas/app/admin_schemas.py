"""
Platform-admin request/response models.

Kept separate from app/schemas.py on purpose: that file's docstring frames
it as "every field returned to a client" (the public allowlist) — mixing
admin-only fields (id, plan_status, status) into it would blur that
guarantee. Nothing here is ever reachable without app/admin_auth.py's
require_platform_admin dependency.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# Mirrors chk_organizations_slug_format / chk_camps_slug_format in
# supabase/migrations/20260917133748_create_saas_schema_v1.sql — validated
# here too so a bad slug fails fast with a readable 422 instead of a raw
# psycopg2 CheckViolation surfacing as a 500.
_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
# Mirrors chk_organizations_primary_color_format.
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
# Mirrors chk_camps_currency_format.
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
# Mirrors chk_organizations_iban_format (migration 20260922143506).
_IBAN_RE = re.compile(r"^[A-Z]{2}[0-9A-Z]{13,32}$")

PlanStatus = Literal["pilot", "active", "suspended", "cancelled"]
CampStatus = Literal["draft", "published", "closed", "archived"]


def _validate_slug(value: str) -> str:
    if not _SLUG_RE.match(value):
        raise ValueError(
            "slug must be lowercase, hyphen-separated (e.g. 'ksv-baunatal'), matching "
            r"^[a-z0-9]+(-[a-z0-9]+)*$"
        )
    return value


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=1)


class AdminLoginResponse(BaseModel):
    token: str
    expires_in_hours: int


class OrganizationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    slug: str = Field(min_length=1)
    name: str = Field(min_length=1)
    legal_name: Optional[str] = None
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    plan_status: PlanStatus = "pilot"
    # Für die Überweisungs-Zahlungsart im Eltern-Flow — settable hier (anders
    # als `theme`, das ausdrücklich keinen Admin-Editor bekommt), damit das
    # Onboarding-Skript sie ohne rohes SQL setzen kann.
    iban: Optional[str] = None

    @field_validator("slug")
    @classmethod
    def _slug_format(cls, value: str) -> str:
        return _validate_slug(value)

    @field_validator("primary_color")
    @classmethod
    def _primary_color_format(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _HEX_COLOR_RE.match(value):
            raise ValueError("primary_color must be a hex color like '#1a2b3c'")
        return value

    @field_validator("iban")
    @classmethod
    def _iban_format(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _IBAN_RE.match(value):
            raise ValueError("iban must look like a real IBAN, e.g. 'DE89370400440532013000'")
        return value


class OrganizationUpdate(BaseModel):
    """Same fields as OrganizationCreate minus `slug` (immutable — a slug
    rename would break every existing camp URL under it) and minus
    `contact_email`'s required-ness (all fields optional; only provided
    fields are changed)."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1)
    legal_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    plan_status: Optional[PlanStatus] = None
    iban: Optional[str] = None

    @field_validator("primary_color")
    @classmethod
    def _primary_color_format(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _HEX_COLOR_RE.match(value):
            raise ValueError("primary_color must be a hex color like '#1a2b3c'")
        return value

    @field_validator("iban")
    @classmethod
    def _iban_format(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _IBAN_RE.match(value):
            raise ValueError("iban must look like a real IBAN, e.g. 'DE89370400440532013000'")
        return value


class CampCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    slug: str = Field(min_length=1)
    title: str = Field(min_length=1)
    start_date: date
    end_date: date
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    age_min: int = Field(ge=0)
    age_max: int = Field(ge=0)
    capacity: int = Field(gt=0)
    price_cents: int = Field(ge=0)
    currency: str = "EUR"
    # Eltern-Flow-Auftrag §6.2: Faktentabelle + Leistungsliste. Optional —
    # NULL heißt "Abschnitt wird nicht angezeigt", kein Platzhaltertext.
    location: Optional[str] = None
    care_info: Optional[str] = None
    meals_info: Optional[str] = None
    includes: Optional[list[str]] = None
    # Defaults to draft, not published — an admin must explicitly publish a
    # camp before parents can see or register for it.
    status: CampStatus = "draft"

    @field_validator("slug")
    @classmethod
    def _slug_format(cls, value: str) -> str:
        return _validate_slug(value)

    @field_validator("currency")
    @classmethod
    def _currency_format(cls, value: str) -> str:
        if not _CURRENCY_RE.match(value):
            raise ValueError("currency must be a 3-letter uppercase ISO-4217-shaped code")
        return value


class OrganizationAdminOut(BaseModel):
    """Admin view of an organization — unlike OrganizationPublic, includes
    the internal id and plan_status an admin needs to operate the platform."""

    id: UUID
    slug: str
    name: str
    legal_name: Optional[str] = None
    contact_email: str
    contact_phone: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    plan_status: str
    # Nur lesend — "Kein Theme-Editor im Admin" (Eltern-Flow-Auftrag
    # Abschnitt 1). Wird bewusst NICHT auf OrganizationCreate/Update
    # geführt, damit es über diese API nicht setzbar ist. Default spiegelt
    # den DB-Default, damit bestehende Test-Fixtures ohne 'theme'-Schlüssel
    # nicht künstlich brechen.
    theme: str = "tradition"
    iban: Optional[str] = None


class CampAdminOut(BaseModel):
    """Admin view of a camp — unlike CampPublic, includes id, organization_id,
    and status (draft camps are real rows to an admin, not 404s)."""

    id: UUID
    organization_id: UUID
    slug: str
    title: str
    start_date: date
    end_date: date
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    age_min: int
    age_max: int
    capacity: int
    price_cents: int
    currency: str
    location: Optional[str] = None
    care_info: Optional[str] = None
    meals_info: Optional[str] = None
    includes: Optional[list[str]] = None
    status: str


class RegistrationAdminOut(BaseModel):
    """
    Admin view of a registration — contains real personal/medical data about
    a child and their parents (Auftrag Abschnitt 9.1, DSGVO Art. 9 für
    allergies/medical_notes). Only ever reachable behind
    require_platform_admin. Deliberately excludes organization_id/camp_id
    (already implied by the URL the client called) and terms_accepted/
    privacy_accepted (write-time consent flags, not operationally useful to
    display — every stored row satisfies them by DB constraint already).
    """

    id: UUID
    registration_token: UUID
    status: str
    payment_status: str
    parent_first_name: str
    parent_last_name: str
    parent_email: str
    parent_phone: str
    child_first_name: str
    child_last_name: str
    child_birth_date: date
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    medical_notes: Optional[str] = None
    allergies: Optional[str] = None
    jersey_size: Optional[str] = None
    pickup_authorized: Optional[str] = None
    photo_permission: bool
    created_at: datetime
