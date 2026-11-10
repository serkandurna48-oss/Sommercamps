"""Schemas for club invoice master data and the platform fee model."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from .fees import PLAN_MONTHLY_CENTS
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

TaxStatus = Literal["ust_pflichtig", "kleinunternehmer", "steuerbefreit"]
_TAX_NUMBER = re.compile(r"^[0-9][0-9 /]{8,18}[0-9]$")
_VAT_ID = re.compile(r"^DE[0-9]{9}$")
_PREFIX = re.compile(r"^[A-Z0-9][A-Z0-9-]{0,11}$")


class BillingProfileIn(BaseModel):
    """Invoice sender data. Mirrors chk_billing_profiles_* in the migration;
    every rule fails with a field name so the form can point at it."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    legal_name: str = Field(min_length=2, max_length=200)
    street: str = Field(min_length=3, max_length=200)
    postal_code: str = Field(pattern=r"^[0-9]{5}$")
    city: str = Field(min_length=2, max_length=100)
    tax_number: Optional[str] = Field(default=None, max_length=20)
    vat_id: Optional[str] = Field(default=None, max_length=11)
    tax_status: TaxStatus
    default_vat_rate: Optional[Literal[7, 19]] = None
    tax_exemption_text: Optional[str] = Field(default=None, max_length=500)
    invoice_number_prefix: str = Field(min_length=1, max_length=12)
    invoice_email: EmailStr

    @field_validator("tax_number", "vat_id", "tax_exemption_text", mode="before")
    @classmethod
    def _blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("vat_id")
    @classmethod
    def _vat_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.replace(" ", "").upper()
        if not _VAT_ID.fullmatch(value):
            raise ValueError("USt-IdNr. im Format DE123456789")
        return value

    @field_validator("tax_number")
    @classmethod
    def _tax_number(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _TAX_NUMBER.fullmatch(value):
            raise ValueError("Steuernummer nur aus Ziffern, Leerzeichen und /")
        return value

    @field_validator("invoice_number_prefix")
    @classmethod
    def _prefix(cls, value: str) -> str:
        value = value.upper()
        if not _PREFIX.fullmatch(value):
            raise ValueError("Präfix: Großbuchstaben, Ziffern, Bindestrich, max. 12 Zeichen")
        return value

    @model_validator(mode="after")
    def _tax_rules(self):
        if self.tax_status == "ust_pflichtig":
            if self.default_vat_rate is None:
                raise ValueError("default_vat_rate: Steuersatz 19 oder 7 wählen")
        else:
            self.default_vat_rate = None
        if self.tax_status == "steuerbefreit":
            if not self.tax_exemption_text or len(self.tax_exemption_text) < 5:
                raise ValueError("tax_exemption_text: Befreiungsgrund angeben")
        else:
            self.tax_exemption_text = None
        if self.tax_status in ("ust_pflichtig", "kleinunternehmer") and not (self.tax_number or self.vat_id):
            raise ValueError("tax_number: Steuernummer oder USt-IdNr. angeben")
        return self


class BillingProfileOut(BaseModel):
    legal_name: str
    street: str
    postal_code: str
    city: str
    tax_number: Optional[str] = None
    vat_id: Optional[str] = None
    tax_status: TaxStatus
    default_vat_rate: Optional[int] = None
    tax_exemption_text: Optional[str] = None
    invoice_number_prefix: str
    invoice_email: str
    updated_at: datetime


class FeeRuleIn(BaseModel):
    """Platform owner adds a fee rule. starter/verein without percent use the
    plan default; individuell needs a percent. Two decimals at most."""

    model_config = ConfigDict(extra="forbid")

    plan: Literal["starter", "verein", "individuell"]
    percent: Optional[Decimal] = Field(default=None, ge=0, le=30, max_digits=4, decimal_places=2)
    fixed_cents: Optional[int] = Field(default=None, ge=0, le=100000)
    min_fee_cents: Optional[int] = Field(default=None, ge=0, le=100000)
    # Monthly base fee in cents excl. VAT; omitted = plan default (starter 0, verein 2490).
    monthly_fee_cents: Optional[int] = Field(default=None, ge=0, le=1000000, strict=True)
    valid_from: date
    note: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _percent_for_individual(self):
        if self.plan == "individuell" and self.percent is None:
            raise ValueError("percent: für Individuell einen Prozentsatz angeben")
        return self


class FeeRuleOut(BaseModel):
    id: Optional[UUID] = None
    plan: str
    percent: Decimal
    fixed_cents: Optional[int] = None
    min_fee_cents: Optional[int] = None
    # Resolved: the rule's own value or the plan default.
    monthly_fee_cents: int = 0
    valid_from: Optional[date] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by_email: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _resolve_monthly_fee(cls, data):
        """Rows store NULL for "plan default"; the API always shows the amount."""
        if isinstance(data, dict) and data.get("monthly_fee_cents") is None:
            return {**data, "monthly_fee_cents": PLAN_MONTHLY_CENTS.get(data.get("plan"), 0)}
        return data


class FeeRulesOut(BaseModel):
    """`current` is the rule for bookings made today; `history` newest first."""

    current: FeeRuleOut
    history: list[FeeRuleOut]


class FeeBookingOut(BaseModel):
    """One paid booking with its platform fee. No parent or child data."""

    registration_id: UUID
    camp_title: str
    paid_at: datetime
    payment_status: str
    fee_collection: str
    fee_base_cents: int
    fee_cents: int
    refunded_cents: int
    fee_refunded_cents: int
    fee_net_cents: int


class FeeTotals(BaseModel):
    bookings: int = 0
    fee_cents: int = 0
    fee_refunded_cents: int = 0
    fee_net_cents: int = 0


class FeeMonthOut(BaseModel):
    """Basis for the monthly fee invoice. `collected` = withheld by Stripe
    (application fee), `not_collected` = owed, not withheld (transfer/cash,
    legacy direct charges). Month = paid date in Europe/Berlin."""

    month: str
    # Base fee of the rule valid on the last day of the month (today in the current
    # month); total = booking fees net of refunds (both kinds) + base fee.
    monthly_fee_cents: int = 0
    total_cents: int = 0
    collected: FeeTotals
    not_collected: FeeTotals
    bookings: list[FeeBookingOut]
    # Refunds booked in the month they happened (for the fee invoice, B4):
    # fee returned this month, whatever month the booking was paid in.
    refunds_in_month: "RefundTotals"


class RefundTotals(BaseModel):
    collected_fee_refunded_cents: int = 0
    not_collected_fee_refunded_cents: int = 0
    refunded_cents: int = 0
    events: int = 0
