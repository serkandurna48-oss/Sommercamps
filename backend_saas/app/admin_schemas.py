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
    contact_person_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    plan_status: PlanStatus = "pilot"
    # Für die Überweisungs-Zahlungsart im Eltern-Flow — settable hier (anders
    # als `theme`, das ausdrücklich keinen Admin-Editor bekommt), damit das
    # Onboarding-Skript sie ohne rohes SQL setzen kann.
    iban: Optional[str] = None
    intro_heading: Optional[str] = None
    intro_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    billing_notes: Optional[str] = None
    # Default false, für JEDEN Aufrufer dieses Endpunkts (auch bestehende
    # Skripte wie onboard_tenant.py/scripts/seed_demo.py, die dieses Feld
    # nicht mitschicken) — "sicher, bis ausdrücklich veröffentlicht" ist der
    # richtige Default unabhängig vom Erstellungsweg, nicht nur im neuen
    # Betreiber-Builder. Ein neu angelegter Verein muss immer erst explizit
    # veröffentlicht werden (PATCH .../organizations/{slug} mit
    # site_published=true), bevor Eltern ihn sehen. Die DB-Spalte selbst hat
    # DEFAULT true (siehe Migration) — das schützt nur bereits bestehende
    # Altbestand-Zeilen vor dieser Änderung, nicht neue Inserts über diese
    # API, die immer explizit false mitschicken.
    site_published: bool = False

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
    contact_person_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    plan_status: Optional[PlanStatus] = None
    iban: Optional[str] = None
    intro_heading: Optional[str] = None
    intro_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    billing_notes: Optional[str] = None
    # Der "Veröffentlichen"/"Zurückziehen"-Schalter läuft über denselben
    # PATCH wie jedes andere Feld — kein eigener /publish-Endpunkt nötig,
    # exclude_unset (siehe update_organization) unterscheidet ohnehin schon
    # zwischen "nicht mitgeschickt" und "bewusst gesetzt".
    site_published: Optional[bool] = None

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


class CampUpdate(BaseModel):
    """Same fields as CampCreate minus `slug` (immutable — a slug rename
    would break every existing registration/parent-facing URL under it).
    All fields optional; only provided fields are changed (see
    repositories/camps.py::update_camp's exclude_unset handling, mirrors
    organizations.update_organization)."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    age_min: Optional[int] = Field(default=None, ge=0)
    age_max: Optional[int] = Field(default=None, ge=0)
    capacity: Optional[int] = Field(default=None, gt=0)
    price_cents: Optional[int] = Field(default=None, ge=0)
    currency: Optional[str] = None
    location: Optional[str] = None
    care_info: Optional[str] = None
    meals_info: Optional[str] = None
    includes: Optional[list[str]] = None
    status: Optional[CampStatus] = None

    @field_validator("currency")
    @classmethod
    def _currency_format(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _CURRENCY_RE.match(value):
            raise ValueError("currency must be a 3-letter uppercase ISO-4217-shaped code")
        return value


class RegistrationStatusOut(BaseModel):
    """Minimal registration identity + lifecycle fields, returned by the
    waitlist-promote and cancel admin actions — deliberately not the full
    RegistrationAdminOut (an action confirmation doesn't need PII back;
    the caller already has it from the list it acted on)."""

    registration_token: UUID
    status: str
    payment_status: str


class WaitlistPromoteResponse(BaseModel):
    """`promoted` is null when there was no free capacity or no one
    waitlisted — a no-op, not an error (mirrors
    repositories.registrations.promote_next_waitlisted_registration's own
    Optional[dict] return)."""

    promoted: Optional[RegistrationStatusOut] = None


class CancelRegistrationResponse(BaseModel):
    """`promoted` is null when the cancelled registration was itself
    waitlisted (nothing freed) or no one else was waiting."""

    cancelled: RegistrationStatusOut
    promoted: Optional[RegistrationStatusOut] = None


class PaymentStatusUpdate(BaseModel):
    """Manual payment bookkeeping — no Stripe/payment-provider integration
    exists in backend_saas yet, so an organizer marks a registration's
    payment_status by hand (e.g. cash/bank transfer received). The DB enum
    (chk_camp_registrations_payment_status) has a fifth value, 'cancelled',
    deliberately NOT offered here: cancel_registration_and_promote_next
    does not currently touch payment_status at all (no DB trigger does
    either — a cancelled registration keeps whatever payment_status it had
    before), so 'cancelled' here would only ever be a confusing, purely
    manual fake of "this payment is moot," never a real reflection of
    cancellation. Reserved, not wired to anything — exclude it from what an
    admin can type into this field until/unless cancellation is actually
    made to set it."""

    model_config = ConfigDict(extra="forbid")

    payment_status: Literal["open", "paid", "refunded", "waived"]


class OrganizationAdminOut(BaseModel):
    """Admin view of an organization — unlike OrganizationPublic, includes
    the internal id and plan_status an admin needs to operate the platform."""

    id: UUID
    slug: str
    name: str
    legal_name: Optional[str] = None
    contact_email: str
    contact_phone: Optional[str] = None
    contact_person_name: Optional[str] = None
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
    intro_heading: Optional[str] = None
    intro_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    billing_notes: Optional[str] = None
    site_published: bool = False


class OrganizationAdminListItem(OrganizationAdminOut):
    """OrganizationAdminOut plus `camp_count` — only the platform console's
    tenant-list view needs the count; the create/update responses (plain
    OrganizationAdminOut) don't compute it, so they stay a separate model
    instead of a shared-but-sometimes-0 field."""

    camp_count: int = 0


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
