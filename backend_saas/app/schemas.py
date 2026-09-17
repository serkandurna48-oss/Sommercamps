"""
Public API response models.

Every field returned to a client is explicitly declared here. A new column
added to `organizations` or `camps` in a future migration does NOT become
publicly visible automatically — someone has to deliberately add it to one
of these models first. See README.md "Public API" for the current field
allowlist and why (e.g.) `id` and `plan_status` are excluded.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from pydantic import BaseModel, computed_field


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
        registration window (a null bound means "no limit" on that side).

        A CampPublic instance is only ever built from an already
        status='published' row (see repositories/camps.py) — so "camp must
        be published" is satisfied by construction, not re-checked here.
        Capacity is deliberately NOT considered yet (out of CP-S404 scope).
        """
        now = datetime.now(timezone.utc)
        if self.registration_start is not None and now < self.registration_start:
            return False
        if self.registration_end is not None and now > self.registration_end:
            return False
        return True
