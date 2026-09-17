"""
Public API response models.

Every field returned to a client is explicitly declared here. A new column
added to `organizations` or `camps` in a future migration does NOT become
publicly visible automatically — someone has to deliberately add it to one
of these models first. See README.md "Public API" for the current field
allowlist and why (e.g.) `id` and `plan_status` are excluded.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator

from .utils import is_registration_open


class OrganizationPublic(BaseModel):
    slug: str
    name: str
    legal_name: Optional[str] = None
    contact_email: str
    contact_phone: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None


class CampPublic(BaseModel):
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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def registration_open(self) -> bool:
        """
        True unless the current moment falls outside an explicit
        registration window — see utils.is_registration_open for the
        shared logic (also used by the registration write-flow, so both
        never drift apart).

        A CampPublic instance is only ever built from an already
        status='published' row (see repositories/camps.py) — so "camp must
        be published" is satisfied by construction, not re-checked here.
        Capacity is deliberately NOT considered yet (out of CP-S404 scope;
        CP-S405 checks capacity only at registration write time).
        """
        return is_registration_open(self.registration_start, self.registration_end)


class RegistrationCreate(BaseModel):
    """
    Public registration request body. Deliberately has NO organization_id
    or camp_id field — those are resolved server-side (see
    app/deps.py::get_tenant_context and
    app/repositories/registrations.py::get_registration_target), never
    accepted from the client. `extra="forbid"` makes an attempt to smuggle
    either in a visible 422 rather than a silently-ignored no-op — a
    slightly stronger guarantee than the default "ignore unknown fields".
    """

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    parent_first_name: str = Field(min_length=1)
    parent_last_name: str = Field(min_length=1)
    parent_email: EmailStr
    parent_phone: str = Field(min_length=1)

    child_first_name: str = Field(min_length=1)
    child_last_name: str = Field(min_length=1)
    child_birth_date: date

    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    medical_notes: Optional[str] = None
    allergies: Optional[str] = None

    photo_permission: bool = False
    terms_accepted: bool
    privacy_accepted: bool

    @field_validator(
        "emergency_contact_name", "emergency_contact_phone", "medical_notes", "allergies",
        mode="after",
    )
    @classmethod
    def _blank_optional_to_none(cls, value: Optional[str]) -> Optional[str]:
        """After str_strip_whitespace, a whitespace-only optional field is
        already trimmed to "" here — normalize that to None rather than
        persisting an empty string. Non-empty values pass through
        unchanged; this is whitespace hygiene, not "correcting" input the
        user didn't actually give."""
        return value or None

    @field_validator("terms_accepted")
    @classmethod
    def _terms_must_be_accepted(cls, value: bool) -> bool:
        if not value:
            raise ValueError("terms_accepted must be true")
        return value

    @field_validator("privacy_accepted")
    @classmethod
    def _privacy_must_be_accepted(cls, value: bool) -> bool:
        if not value:
            raise ValueError("privacy_accepted must be true")
        return value


class RegistrationCreated(BaseModel):
    """
    Response for a successful registration. Deliberately excludes the
    internal `id`, `organization_id`, and `camp_id` — `registration_token`
    is the only identifier a client ever needs (confirmation page, future
    payment flow), exactly mirroring the legacy system's
    id-vs-registration_token split (see backend/schema.sql).
    """

    registration_token: UUID
    status: str
    payment_status: str
