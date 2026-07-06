from __future__ import annotations

import csv
import io
import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Generator, Literal, Optional
from uuid import UUID

import jwt
import psycopg2
import requests as http_client
import stripe
from stripe._error import SignatureVerificationError as StripeSignatureError
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, field_validator, model_validator

from camp_config import (
    CAMP_AGE_MAX,
    CAMP_AGE_MIN,
    CAMP_WEEKS,
    get_camp_week_by_label,
    validate_age_at_camp_start,
)

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATABASE_URL: str    = os.environ["DATABASE_URL"]
ADMIN_PASSWORD: str  = os.environ["ADMIN_PASSWORD"]
JWT_SECRET: str      = os.environ["JWT_SECRET"]
TOKEN_EXPIRE_HOURS: int = int(os.getenv("TOKEN_EXPIRE_HOURS", "24"))

# E-Mail (Phase 2) — optional; Backend läuft auch ohne diese Vars.
# Wenn BREVO_API_KEY oder EMAIL_FROM fehlen, wird Mailversand übersprungen.
BREVO_API_KEY:   str = os.getenv("BREVO_API_KEY", "")
EMAIL_FROM:      str = os.getenv("EMAIL_FROM", "")
EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Fußballschule KSV Baunatal")
CONTACT_EMAIL:   str = os.getenv("CONTACT_EMAIL", "info@ksv-baunatal.de")
# Reply-To: Antworten landen beim Kontakt-Postfach, nicht beim Absender-Alias.
# Falls nicht gesetzt, wird CONTACT_EMAIL genutzt.
EMAIL_REPLY_TO:  str = os.getenv("EMAIL_REPLY_TO", "") or os.getenv("CONTACT_EMAIL", "info@ksv-baunatal.de")

# Bankdaten für Überweisungshinweis (Phase 2)
# Echte Werte per Env-Var setzen: BANK_ACCOUNT_HOLDER, BANK_IBAN, BANK_BIC, BANK_NAME
BANK_CONFIG: dict[str, str] = {
    "account_holder": os.getenv("BANK_ACCOUNT_HOLDER", "[noch einfügen]"),
    "iban":           os.getenv("BANK_IBAN",           "[noch einfügen]"),
    "bic":            os.getenv("BANK_BIC",            "[noch einfügen]"),
    "bank":           os.getenv("BANK_NAME",           "[noch einfügen]"),
}

# Stripe (Phase 3) — nur Testmode-Keys committen, nie Live-Keys
# STRIPE_SECRET_KEY:     sk_test_... (Render Env Var)
# STRIPE_WEBHOOK_SECRET: whsec_...  (Render Env Var)
STRIPE_SECRET_KEY:      str = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET:  str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_CENTS:     int = int(os.getenv("STRIPE_PRICE_CENTS", "0"))  # z. B. 15000 = 150,00 €
FRONTEND_URL:           str = os.getenv("FRONTEND_URL", "http://localhost:3000")

logger = logging.getLogger(__name__)

ALLOWED_JERSEY_SIZES = {"6XS–5XS (104–116)", "4XS–3XS (128–140)", "2XS (152)", "XS (164)", "S", "M"}
# Derived from camp_config.CAMP_WEEKS — single source of truth is camp_config.
ALLOWED_CAMP_WEEKS = {w.label for w in CAMP_WEEKS}

# ---------------------------------------------------------------------------
# Connection Pool
# ---------------------------------------------------------------------------

# Wird beim App-Start befüllt, beim Shutdown geschlossen.
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _init_pool() -> None:
    """Erzeugt den ThreadedConnectionPool aus DATABASE_URL."""
    global _pool
    # sslmode=require für Supabase Transaction Pooler (falls nicht bereits in der URL)
    dsn = DATABASE_URL if "sslmode=" in DATABASE_URL else DATABASE_URL + "?sslmode=require"
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=dsn,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _close_pool() -> None:
    """Gibt alle Pool-Verbindungen frei."""
    if _pool is not None:
        _pool.closeall()


@contextmanager
def get_db_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Leiht eine Verbindung aus dem Pool aus und gibt sie danach zurück.

    Beispiel:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    if _pool is None:
        raise RuntimeError("Datenbankpool wurde noch nicht initialisiert.")
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


@contextmanager
def db_cursor() -> Generator[psycopg2.extras.RealDictCursor, None, None]:
    """
    Kombinierter Context-Manager: leiht Verbindung aus dem Pool,
    öffnet einen Cursor, committet bei Erfolg, rollt bei Fehler zurück.

    Beispiel:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations")
            rows = cur.fetchall()
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def serialize(row: dict) -> dict:
    """Wandelt psycopg2-Typen (UUID, date, datetime, Decimal) in JSON-kompatible Typen um."""
    out: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, UUID):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, date):
            out[key] = value.isoformat()
        elif isinstance(value, Decimal):
            out[key] = float(value)
        else:
            out[key] = value
    return out


def bank_purpose(first_name: str, last_name: str) -> str:
    """Verwendungszweck für die Überweisung: 'Sommercamp Vorname Nachname'."""
    return f"Sommercamp {first_name} {last_name}".strip()


def format_price_display(cents: int) -> str:
    """Formatiert einen Cent-Betrag als ganzzahligen Euro-Betrag (z. B. 14900 -> '149 €')."""
    if cents <= 0:
        return ""
    return f"{round(cents / 100):,}".replace(",", ".") + " €"


def bank_details_configured() -> bool:
    """True, wenn alle Bankdaten-Felder per Env-Var gesetzt wurden (kein Platzhalter mehr)."""
    return all(value and value != "[noch einfügen]" for value in BANK_CONFIG.values())


# ---------------------------------------------------------------------------
# Lifespan (Startup / Shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pool beim Start initialisieren, beim Shutdown schließen."""
    _init_pool()
    logger.info(
        "[startup] Stripe konfiguriert: STRIPE_SECRET_KEY=%s | STRIPE_PRICE_CENTS=%d | FRONTEND_URL=%s",
        bool(STRIPE_SECRET_KEY),
        STRIPE_PRICE_CENTS,
        FRONTEND_URL or "(leer)",
    )
    yield
    _close_pool()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="KSV Baunatal Sommercamp API",
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "https://sommercamps.vercel.app",
]
CORS_ORIGIN_REGEX = (
    r"^https://sommercamps-[a-z0-9-]+-serkans-projects-a49183cd\.vercel\.app$"
)
_extra = os.getenv("CORS_ORIGINS_EXTRA", "")
if _extra:
    CORS_ORIGINS.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class AdminLoginIn(BaseModel):
    password: str


class RegistrationIn(BaseModel):
    child_first_name: str
    child_last_name: str
    birth_date: date
    parent_name: str
    email: EmailStr
    phone: str
    selected_camp_week: str
    jersey_size: Optional[str] = None
    allergies: Optional[str] = None
    notes: Optional[str] = None
    consent_privacy: bool
    photo_permission: bool = False  # Bilderrechte; Standard: Nein

    @field_validator("child_first_name", "child_last_name", "parent_name", "phone")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Darf nicht leer sein.")
        return v.strip()

    @field_validator("selected_camp_week")
    @classmethod
    def valid_week(cls, v: str) -> str:
        if v not in ALLOWED_CAMP_WEEKS:
            raise ValueError(f"Ungültige Camp-Woche. Erlaubt: {sorted(ALLOWED_CAMP_WEEKS)}")
        return v

    @field_validator("jersey_size")
    @classmethod
    def valid_size(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ALLOWED_JERSEY_SIZES:
            raise ValueError(f"Ungültige Größe. Erlaubt: {sorted(ALLOWED_JERSEY_SIZES)}")
        return v

    @field_validator("consent_privacy")
    @classmethod
    def must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Datenschutzerklärung muss akzeptiert werden.")
        return v

    @model_validator(mode="after")
    def check_age_at_camp_start(self) -> RegistrationIn:
        camp_week = get_camp_week_by_label(self.selected_camp_week)
        if camp_week is None:
            # valid_week field_validator already raised; nothing more to do here.
            return self
        ok, error_msg = validate_age_at_camp_start(self.birth_date, camp_week.start_date)
        if not ok:
            raise ValueError(error_msg)
        return self


class RegistrationOut(BaseModel):
    id: str
    created_at: str
    registration_token: str       # öffentliches Token für Payment-Links (Phase 3)
    child_first_name: str
    child_last_name: str
    birth_date: str
    parent_name: str
    email: str
    phone: str
    selected_camp_week: str
    jersey_size: Optional[str]
    allergies: Optional[str]
    notes: Optional[str]
    consent_privacy: bool
    photo_permission: bool             # Bilderrechte
    status: str
    payment_status: str
    paid_at: Optional[str]             # gesetzt, wenn payment_status = 'paid'
    email_sent_at: Optional[str]       # gesetzt nach Mailversand (Phase 2)
    stripe_session_id: Optional[str]   # gesetzt beim Checkout (Phase 3)
    # Bankdaten: nur beim POST /registrations befüllt (für Bestätigungsseite)
    bank_account_holder: Optional[str] = None
    bank_iban:           Optional[str] = None
    bank_bic:            Optional[str] = None
    bank_name:           Optional[str] = None
    bank_purpose:        Optional[str] = None

class PaymentStatusIn(BaseModel):
    payment_status: Literal["open", "paid", "cancelled"]


class CampPriceConfig(BaseModel):
    price_cents: int
    currency: str = "EUR"
    age_min: int
    age_max: int


class WeekInfo(BaseModel):
    label: str
    start_date: date
    end_date: date


class ConfigResponse(BaseModel):
    camp: CampPriceConfig
    weeks: list[WeekInfo]


# ---------------------------------------------------------------------------
# DB Constraint → lesbare Fehlermeldung
# ---------------------------------------------------------------------------

CONSTRAINT_MESSAGES: dict[str, str] = {
    "chk_birth_date_range":          "Das Kind muss zwischen 5 und 18 Jahren alt sein.",
    "chk_child_first_name_not_blank": "Vorname des Kindes darf nicht leer sein.",
    "chk_child_last_name_not_blank":  "Nachname des Kindes darf nicht leer sein.",
    "chk_parent_name_not_blank":      "Name des Elternteils darf nicht leer sein.",
    "chk_phone_not_blank":            "Telefonnummer darf nicht leer sein.",
    "chk_email_format":               "Bitte eine gültige E-Mail-Adresse angeben.",
    "chk_camp_week_not_blank":        "Bitte einen Camptermin auswählen.",
    "chk_jersey_size_allowed":        "Ungültige Trikotnummer.",
    "chk_consent_given":              "Datenschutzerklärung muss akzeptiert werden.",
}

# ---------------------------------------------------------------------------
# E-Mail (Phase 2)
# ---------------------------------------------------------------------------

_STATUS_LABELS: dict[str, str] = {
    "registered": "Anmeldung eingegangen",
    "confirmed":  "Teilnahme bestätigt",
    "waitlist":   "Warteliste",
    "cancelled":  "Storniert",
}
_PAYMENT_LABELS: dict[str, str] = {
    "open":      "Zahlung offen",
    "paid":      "Bezahlt",
    "waived":    "Zahlung nicht erforderlich",
    "refunded":  "Erstattet",
    "cancelled": "Storniert",
}


def _child_name(row: dict) -> str:
    return f"{row.get('child_first_name', '')} {row.get('child_last_name', '')}".strip()


def _status_banner_html(row: dict) -> str:
    """Farbige Statusmeldung analog zur Bestätigungsseite im Frontend (RegistrationForm.tsx)."""
    payment_status = row.get("payment_status") or "open"
    child_first = row.get("child_first_name", "")
    if payment_status == "open":
        return (
            '<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:8px;'
            'padding:14px 16px;margin-bottom:24px;">'
            '<p style="margin:0 0 4px;font-weight:700;color:#92400e;font-size:14px;">'
            "Platz vorläufig reserviert</p>"
            f'<p style="margin:0;color:#b45309;font-size:13px;line-height:1.5;">'
            f"Der Platz für {child_first} ist fest gesichert, sobald der Campbeitrag "
            "bei uns eingegangen ist.</p></div>"
        )
    if payment_status == "waived":
        return (
            '<div style="border:1px solid #bbf7d0;background:#ecfdf5;border-radius:8px;'
            'padding:14px 16px;margin-bottom:24px;">'
            '<p style="margin:0 0 4px;font-weight:700;color:#065f46;font-size:14px;">'
            "Zahlung nicht erforderlich</p>"
            '<p style="margin:0;color:#047857;font-size:13px;line-height:1.5;">'
            "Für diese Anmeldung ist keine Zahlung erforderlich.</p></div>"
        )
    if payment_status == "paid":
        return (
            '<div style="border:1px solid #bbf7d0;background:#ecfdf5;border-radius:8px;'
            'padding:14px 16px;margin-bottom:24px;">'
            '<p style="margin:0 0 4px;font-weight:700;color:#065f46;font-size:14px;">'
            "Zahlung bestätigt</p>"
            f'<p style="margin:0;color:#047857;font-size:13px;line-height:1.5;">'
            f"Die Teilnahme von {child_first} ist damit bestätigt.</p></div>"
        )
    return ""


def _bank_section_html(row: dict) -> str:
    """Banküberweisungs-Block, oder ein Hinweistext, falls Bankdaten fehlen oder Zahlung nicht offen ist."""
    if row.get("payment_status") not in (None, "", "open"):
        return ""

    if not bank_details_configured():
        return (
            '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">'
            '<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">'
            "Die Zahlungsinformationen werden dir durch den Verein mitgeteilt. "
            "Bei Fragen wende dich bitte direkt an unseren Ansprechpartner "
            f'(<a href="mailto:{CONTACT_EMAIL}" style="color:#111111;">{CONTACT_EMAIL}</a>).</p></div>'
        )

    purpose = bank_purpose(row.get("child_first_name", ""), row.get("child_last_name", ""))
    amount = format_price_display(STRIPE_PRICE_CENTS)
    amount_row = (
        '<tr><td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;">'
        "Betrag</td>"
        '<td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#111111;font-size:13px;'
        f'font-weight:700;">{amount}</td></tr>'
        if amount
        else ""
    )
    return f"""
            <div style="border:1px solid #d1fae5;border-radius:8px;margin-bottom:24px;overflow:hidden;">
              <div style="background:#ecfdf5;padding:10px 16px;border-bottom:1px solid #d1fae5;">
                <p style="margin:0;font-weight:700;color:#065f46;font-size:13px;">Zahlung per Banküberweisung</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;width:42%;">Kontoinhaber</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#111111;font-size:13px;font-weight:600;">{BANK_CONFIG['account_holder']}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;">IBAN</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#111111;font-size:13px;font-weight:600;font-family:monospace,monospace;">{BANK_CONFIG['iban']}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;">BIC</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#111111;font-size:13px;font-weight:600;">{BANK_CONFIG['bic']}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;">Bank</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#111111;font-size:13px;font-weight:600;">{BANK_CONFIG['bank']}</td>
                </tr>
                {amount_row}
                <tr>
                  <td style="padding:10px 16px;color:#6b7280;font-size:12px;">Verwendungszweck</td>
                  <td style="padding:10px 16px;color:#111111;font-size:13px;font-weight:700;">{purpose}</td>
                </tr>
              </table>
            </div>"""


def _next_steps_html(row: dict) -> str:
    """Nummerierte Schritte, analog zur Bestätigungsseite im Frontend."""
    if row.get("payment_status") in (None, "", "open"):
        steps = [
            "Campbeitrag mit dem oben angegebenen Verwendungszweck überweisen.",
            "Nach Zahlungseingang erhältst du eine Bestätigung vom Verein.",
            "Kurz vor dem Camp melden wir uns mit Details zu Uhrzeit und Treffpunkt.",
        ]
    else:
        steps = [
            "Bestätigungs-E-Mail griffbereit halten.",
            "Kurz vor dem Camp melden wir uns mit Details zu Uhrzeit und Treffpunkt.",
        ]
    return "".join(
        f'<p style="margin:0 0 6px;color:#374151;font-size:14px;line-height:1.6;">{i + 1}. {step}</p>'
        for i, step in enumerate(steps)
    )


def _build_confirmation_html(row: dict) -> str:
    """Gibt den HTML-Body der Bestätigungsmail zurück."""
    child_name    = _child_name(row)
    status_label  = _STATUS_LABELS.get(row.get("status", ""), "Anmeldung eingegangen")
    payment_label = _PAYMENT_LABELS.get(row.get("payment_status", ""), "Zahlung offen")
    photo_label   = "Ja, erteilt" if row.get("photo_permission") else "Nein, nicht erteilt"
    return (
        """<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">KSV Baunatal</p>
            <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Fußballschule</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111111;">Anmeldung eingegangen</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hallo PARENT_NAME,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              vielen Dank für die Anmeldung von <strong>CHILD_NAME</strong> beim Sommercamp 2026
              der Fußballschule KSV Baunatal.
            </p>

            STATUS_BANNER_HTML

            <!-- Zusammenfassung -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:13px 16px;border-bottom:1px solid #f3f4f6;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Teilnehmer</span>
                  <span style="color:#111111;font-weight:600;font-size:15px;">CHILD_NAME</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border-bottom:1px solid #f3f4f6;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Termin</span>
                  <span style="color:#111111;font-weight:600;font-size:15px;">CAMP_WEEK</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border-bottom:1px solid #f3f4f6;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Anmeldestatus</span>
                  <span style="color:#111111;font-weight:600;font-size:15px;">STATUS_LABEL</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;border-bottom:1px solid #f3f4f6;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Zahlungsstatus</span>
                  <span style="color:#111111;font-weight:600;font-size:15px;">PAYMENT_LABEL</span>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 16px;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Foto-/Videoerlaubnis</span>
                  <span style="color:#111111;font-weight:600;font-size:15px;">PHOTO_PERMISSION_LABEL</span>
                </td>
              </tr>
            </table>

            BANK_SECTION_HTML

            <!-- Nächste Schritte -->
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 10px;font-weight:700;color:#111111;font-size:14px;">So geht es weiter</p>
              NEXT_STEPS_HTML
            </div>

            <p style="margin:0;font-size:14px;color:#6b7280;">
              Fragen zur Anmeldung? Wir sind für dich da unter
              <a href="mailto:CONTACT_EMAIL" style="color:#111111;font-weight:500;">CONTACT_EMAIL</a>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
              © 2026 KSV Baunatal e.V. · Diese E-Mail wurde automatisch erstellt.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
        .replace("PARENT_NAME",           str(row.get("parent_name", "")))
        .replace("CHILD_NAME",            child_name)
        .replace("CAMP_WEEK",             str(row.get("selected_camp_week", "")))
        .replace("STATUS_LABEL",          status_label)
        .replace("PAYMENT_LABEL",         payment_label)
        .replace("PHOTO_PERMISSION_LABEL", photo_label)
        .replace("STATUS_BANNER_HTML",    _status_banner_html(row))
        .replace("BANK_SECTION_HTML",     _bank_section_html(row))
        .replace("NEXT_STEPS_HTML",       _next_steps_html(row))
        .replace("CONTACT_EMAIL",         CONTACT_EMAIL)
    )


def _status_banner_text(row: dict) -> str:
    """Plain-Text-Gegenstück zu _status_banner_html."""
    payment_status = row.get("payment_status") or "open"
    child_first = row.get("child_first_name", "")
    if payment_status == "open":
        return (
            f"Platz vorläufig reserviert: Der Platz für {child_first} ist fest gesichert, "
            "sobald der Campbeitrag bei uns eingegangen ist.\n\n"
        )
    if payment_status == "waived":
        return "Zahlung nicht erforderlich: Für diese Anmeldung ist keine Zahlung erforderlich.\n\n"
    if payment_status == "paid":
        return f"Zahlung bestätigt: Die Teilnahme von {child_first} ist damit bestätigt.\n\n"
    return ""


def _bank_section_text(row: dict) -> str:
    """Plain-Text-Gegenstück zu _bank_section_html."""
    if row.get("payment_status") not in (None, "", "open"):
        return ""

    if not bank_details_configured():
        return (
            "Die Zahlungsinformationen werden dir durch den Verein mitgeteilt. "
            "Bei Fragen wende dich bitte direkt an unseren Ansprechpartner "
            f"({CONTACT_EMAIL}).\n\n"
        )

    purpose = bank_purpose(row.get("child_first_name", ""), row.get("child_last_name", ""))
    amount = format_price_display(STRIPE_PRICE_CENTS)
    amount_line = f"Betrag:           {amount}\n" if amount else ""
    return (
        "--- Bankverbindung ---\n"
        f"Kontoinhaber:     {BANK_CONFIG['account_holder']}\n"
        f"IBAN:             {BANK_CONFIG['iban']}\n"
        f"BIC:              {BANK_CONFIG['bic']}\n"
        f"Bank:             {BANK_CONFIG['bank']}\n"
        f"{amount_line}"
        f"Verwendungszweck: {purpose}\n\n"
    )


def _next_steps_text(row: dict) -> str:
    """Plain-Text-Gegenstück zu _next_steps_html."""
    if row.get("payment_status") in (None, "", "open"):
        steps = [
            "Campbeitrag mit dem oben angegebenen Verwendungszweck überweisen.",
            "Nach Zahlungseingang erhältst du eine Bestätigung vom Verein.",
            "Kurz vor dem Camp melden wir uns mit Details zu Uhrzeit und Treffpunkt.",
        ]
    else:
        steps = [
            "Bestätigungs-E-Mail griffbereit halten.",
            "Kurz vor dem Camp melden wir uns mit Details zu Uhrzeit und Treffpunkt.",
        ]
    return "\n".join(f"{i + 1}. {step}" for i, step in enumerate(steps))


def _build_confirmation_text(row: dict) -> str:
    """Gibt den Plain-Text-Fallback der Bestätigungsmail zurück."""
    child_name    = _child_name(row)
    status_label  = _STATUS_LABELS.get(row.get("status", ""), "Anmeldung eingegangen")
    payment_label = _PAYMENT_LABELS.get(row.get("payment_status", ""), "Zahlung offen")
    photo_label   = "Ja, erteilt" if row.get("photo_permission") else "Nein, nicht erteilt"
    return (
        f"Anmeldung eingegangen!\n\n"
        f"Hallo {row.get('parent_name', '')},\n\n"
        f"wir haben die Anmeldung für {child_name} erhalten.\n\n"
        f"{_status_banner_text(row)}"
        f"Termin:               {row.get('selected_camp_week', '')}\n"
        f"Anmeldestatus:        {status_label}\n"
        f"Zahlungsstatus:       {payment_label}\n"
        f"Foto-/Videoerlaubnis: {photo_label}\n\n"
        f"{_bank_section_text(row)}"
        f"So geht es weiter:\n"
        f"{_next_steps_text(row)}\n\n"
        f"Fragen zur Anmeldung? Wir sind für dich da unter: {CONTACT_EMAIL}\n\n"
        f"Herzliche Grüße,\n"
        f"Dein Team der Fußballschule KSV Baunatal"
    )


def _try_send_confirmation_email(row: dict) -> None:
    """
    Versucht eine Bestätigungsmail via Brevo zu senden.

    - Überspringt, wenn BREVO_API_KEY oder EMAIL_FROM nicht gesetzt sind.
    - Überspringt, wenn email_sent_at bereits gesetzt ist (Idempotenz).
    - Setzt email_sent_at in der DB und im row-dict bei Erfolg.
    - Loggt bei Fehler nur eine Warnung — die Registrierung bleibt immer erhalten.
    """
    if not BREVO_API_KEY or not EMAIL_FROM:
        logger.info("E-Mail-Versand übersprungen: BREVO_API_KEY oder EMAIL_FROM nicht konfiguriert.")
        return

    if row.get("email_sent_at"):
        logger.info("E-Mail für %s bereits gesendet — übersprungen.", row.get("email"))
        return

    try:
        resp = http_client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "sender": {"name": EMAIL_FROM_NAME, "email": EMAIL_FROM},
                "to": [{"email": row["email"], "name": row.get("parent_name", "")}],
                "subject": f"Anmeldebestätigung Sommercamp – {_child_name(row)} ({row.get('selected_camp_week', '')})",
                "htmlContent": _build_confirmation_html(row),
                "textContent": _build_confirmation_text(row),
                "replyTo": {"email": EMAIL_REPLY_TO, "name": EMAIL_FROM_NAME},
            },
            timeout=10,
        )
        resp.raise_for_status()

        # email_sent_at in DB setzen
        with db_cursor() as cur:
            cur.execute(
                "UPDATE camp_registrations SET email_sent_at = now() WHERE id = %s RETURNING email_sent_at",
                (str(row["id"]),),
            )
            updated = cur.fetchone()

        if updated and updated.get("email_sent_at"):
            row["email_sent_at"] = updated["email_sent_at"]
            logger.info("Bestätigungsmail gesendet und email_sent_at gesetzt für %s.", row.get("email"))

    except Exception as exc:
        logger.warning(
            "E-Mail-Versand fehlgeschlagen für %s: %s — Registrierung bleibt gespeichert.",
            row.get("email"),
            exc,
        )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False)


def verify_session_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Prüft das JWT-Session-Token aus dem Authorization-Header."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nicht authentifiziert.",
        )
    try:
        jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sitzung abgelaufen. Bitte neu anmelden.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültige Sitzung.",
        )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post(
    "/admin/login",
    tags=["Admin"],
    summary="Admin-Login – gibt ein zeitlich begrenztes Session-Token zurück",
)
def admin_login(payload: AdminLoginIn) -> dict:
    """
    Prüft das Admin-Passwort mit timing-sicherem Vergleich.
    Gibt bei Erfolg ein signiertes JWT zurück, das TOKEN_EXPIRE_HOURS gültig ist.
    Fehlermeldungen geben keine Hinweise auf gültige Passwörter.
    """
    if not secrets.compare_digest(payload.password.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Anmeldung fehlgeschlagen.",
        )
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "admin",
            "iat": now,
            "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token, "expires_in_hours": TOKEN_EXPIRE_HOURS}


@app.get("/config", tags=["System"])
def get_config(response: Response) -> ConfigResponse:
    """Gibt öffentliche Konfigurationswerte zurück (Preis, Altersregel, Camp-Wochen)."""
    if STRIPE_PRICE_CENTS <= 0:
        logger.warning("GET /config: STRIPE_PRICE_CENTS ist nicht gesetzt oder <= 0")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Preiskonfiguration nicht verfügbar.",
        )
    response.headers["Cache-Control"] = "public, max-age=300"
    return ConfigResponse(
        camp=CampPriceConfig(
            price_cents=STRIPE_PRICE_CENTS,
            age_min=CAMP_AGE_MIN,
            age_max=CAMP_AGE_MAX,
        ),
        weeks=[
            WeekInfo(label=w.label, start_date=w.start_date, end_date=w.end_date)
            for w in CAMP_WEEKS
        ],
    )


@app.get("/health", tags=["System"])
def health() -> dict:
    """Gibt den DB-Status zurück."""
    try:
        with db_cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok", "database": "reachable"}
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "database": str(exc)},
        )


@app.post(
    "/registrations",
    status_code=status.HTTP_201_CREATED,
    response_model=RegistrationOut,
    tags=["Registrations"],
    summary="Neue Anmeldung einreichen (öffentlich)",
)
def create_registration(payload: RegistrationIn) -> dict:
    """
    Speichert eine neue Camp-Anmeldung.

    Verwendet parameterisierte Queries — keine SQL-Injection möglich.
    Gibt den vollständig gespeicherten Datensatz zurück.
    """
    sql = """
        INSERT INTO camp_registrations (
            child_first_name, child_last_name, birth_date,
            parent_name, email, phone,
            selected_camp_week, jersey_size,
            allergies, notes, consent_privacy, photo_permission
        ) VALUES (
            %(child_first_name)s, %(child_last_name)s, %(birth_date)s,
            %(parent_name)s, %(email)s, %(phone)s,
            %(selected_camp_week)s, %(jersey_size)s,
            %(allergies)s, %(notes)s, %(consent_privacy)s, %(photo_permission)s
        )
        RETURNING *
    """
    try:
        with db_cursor() as cur:
            cur.execute(sql, payload.model_dump())
            row = cur.fetchone()
    except psycopg2.errors.CheckViolation as exc:
        name = exc.diag.constraint_name or ""
        msg = CONSTRAINT_MESSAGES.get(name, f"Ungültige Eingabe ({name}).")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=msg,
        )
    except psycopg2.pool.PoolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Keine freie Datenbankverbindung: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Anmeldung konnte nicht gespeichert werden: {exc}",
        )

    # Registrierung ist committed. Jetzt best-effort Mailversand.
    # Fehler beim Mailversand dürfen die Anmeldung nicht abbrechen.
    row = dict(row)
    _try_send_confirmation_email(row)

    result = serialize(row)
    # Bankdaten aus Backend-Config anfügen – Frontend hat keinen Zugriff auf Render-Env-Vars
    result["bank_account_holder"] = BANK_CONFIG["account_holder"]
    result["bank_iban"]           = BANK_CONFIG["iban"]
    result["bank_bic"]            = BANK_CONFIG["bic"]
    result["bank_name"]           = BANK_CONFIG["bank"]
    result["bank_purpose"]        = bank_purpose(
        row.get("child_first_name", ""), row.get("child_last_name", "")
    )
    return result


@app.get(
    "/registrations",
    response_model=list[RegistrationOut],
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Alle Anmeldungen abrufen (Admin)",
)
def list_registrations() -> list[dict]:
    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations ORDER BY created_at DESC")
            rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")
    return [serialize(dict(row)) for row in rows]


@app.get(
    "/registrations/export/csv",
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Alle Anmeldungen als CSV exportieren (Admin)",
)
def export_registrations_csv() -> StreamingResponse:
    """
    Gibt alle Anmeldungen als UTF-8-CSV mit BOM zurück
    (BOM sorgt dafür, dass Excel Umlaute korrekt anzeigt).
    Nur für Admins zugänglich.
    """
    CSV_COLUMNS = [
        "id", "created_at", "registration_token",
        "child_first_name", "child_last_name", "birth_date",
        "parent_name", "email", "phone",
        "selected_camp_week", "jersey_size",
        "allergies", "notes",
        "consent_privacy", "photo_permission",
        "status", "payment_status", "paid_at",
        "email_sent_at",
    ]
    CSV_HEADERS = [
        "ID", "Anmeldedatum", "Anmelde-Token",
        "Vorname Kind", "Nachname Kind", "Geburtsdatum",
        "Elternteil", "E-Mail", "Telefon",
        "Termin", "Trikotnummer",
        "Allergien", "Notizen",
        "Datenschutz", "Foto-/Videoerlaubnis",
        "Status", "Zahlungsstatus", "Bezahlt am",
        "Mail gesendet am",
    ]

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations ORDER BY created_at DESC")
            rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")

    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM für Excel-Kompatibilität
    writer = csv.DictWriter(
        output,
        fieldnames=CSV_COLUMNS,
        extrasaction="ignore",
        delimiter=";",  # Semikolon ist Standard in deutschen Excel-Versionen
    )
    # Eigene Kopfzeile mit deutschen Labels
    writer.writerow(dict(zip(CSV_COLUMNS, CSV_HEADERS)))
    for row in rows:
        writer.writerow(serialize(dict(row)))

    filename = f"anmeldungen-{__import__('datetime').date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get(
    "/registrations/{registration_id}",
    response_model=RegistrationOut,
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Einzelne Anmeldung abrufen (Admin)",
)
def get_registration(registration_id: str) -> dict:
    try:
        uid = uuid.UUID(registration_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ungültiges UUID-Format.")

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations WHERE id = %s", (str(uid),))
            row = cur.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Anmeldung {registration_id} nicht gefunden.")

    return serialize(dict(row))


@app.delete(
    "/registrations/{registration_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Anmeldung löschen (Admin)",
)
def delete_registration(registration_id: str) -> dict:
    try:
        uid = uuid.UUID(registration_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ungültiges UUID-Format.")

    try:
        with db_cursor() as cur:
            cur.execute("DELETE FROM camp_registrations WHERE id = %s RETURNING id", (str(uid),))
            deleted = cur.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")

    if deleted is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Anmeldung {registration_id} nicht gefunden.")

    return {"message": "Anmeldung gelöscht.", "id": str(deleted["id"])}


@app.patch(
    "/admin/registrations/{registration_id}/payment-status",
    response_model=RegistrationOut,
    dependencies=[Depends(verify_session_token)],
    tags=["Admin"],
    summary="Zahlungsstatus einer Anmeldung setzen (Admin)",
)
def update_payment_status(registration_id: str, payload: PaymentStatusIn) -> dict:
    """
    Setzt den Zahlungsstatus einer Anmeldung.

    - paid:             paid_at = now()
    - open / cancelled: paid_at = NULL  (Status eindeutig, kein irreführendes Datum)

    Nur Admins dürfen diesen Endpunkt nutzen (JWT erforderlich).
    """
    try:
        uid = uuid.UUID(registration_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ungültiges UUID-Format.",
        )

    paid_at_expr = "paid_at = now()" if payload.payment_status == "paid" else "paid_at = NULL"

    sql = f"""
        UPDATE camp_registrations
           SET payment_status = %(payment_status)s,
               {paid_at_expr}
         WHERE id = %(id)s
         RETURNING *
    """
    try:
        with db_cursor() as cur:
            cur.execute(sql, {"payment_status": payload.payment_status, "id": str(uid)})
            row = cur.fetchone()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Datenbankfehler: {exc}",
        )

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anmeldung {registration_id} nicht gefunden.",
        )
    return serialize(dict(row))


# ---------------------------------------------------------------------------
# Phase 3 – Stripe Checkout
# ---------------------------------------------------------------------------

@app.post(
    "/registrations/{registration_token}/checkout-session",
    tags=["Payment"],
    summary="Stripe Checkout Session erstellen",
)
def create_checkout_session(registration_token: str) -> dict:
    """
    Erstellt eine Stripe Checkout Session für eine Anmeldung.

    Authentifizierung erfolgt ausschließlich über den registration_token
    im Pfad – kein JWT, kein öffentlicher Zugriff ohne gültigen Token.

    Gibt {"checkout_url": "https://checkout.stripe.com/..."} zurück.
    """
    logger.info("[checkout] token empfangen: %s", registration_token[:8] + "…")
    logger.info(
        "[checkout] STRIPE_SECRET_KEY gesetzt: %s | STRIPE_PRICE_CENTS: %d | FRONTEND_URL: %s",
        bool(STRIPE_SECRET_KEY),
        STRIPE_PRICE_CENTS,
        FRONTEND_URL or "(leer)",
    )

    if not STRIPE_SECRET_KEY:
        logger.error("[checkout] STRIPE_SECRET_KEY fehlt – Abbruch.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Online-Zahlung ist aktuell nicht konfiguriert.",
        )
    if STRIPE_PRICE_CENTS <= 0:
        logger.error("[checkout] STRIPE_PRICE_CENTS ist 0 oder fehlt – Abbruch.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Camppreis ist nicht konfiguriert.",
        )

    # Anmeldung per registration_token laden
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM camp_registrations WHERE registration_token = %s",
                (registration_token,),
            )
            row = cur.fetchone()
    except Exception as exc:
        logger.error("[checkout] DB-Fehler beim Laden der Anmeldung: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Datenbankfehler: {exc}",
        )

    if row is None:
        logger.warning("[checkout] Keine Anmeldung gefunden für token: %s…", registration_token[:8])
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anmeldung nicht gefunden.",
        )

    row = dict(row)
    reg_id = str(row["id"])
    child_name = f"{row.get('child_first_name', '')} {row.get('child_last_name', '')}".strip()
    logger.info("[checkout] Anmeldung gefunden: id=%s kind=%s", reg_id, child_name)

    stripe.api_key = STRIPE_SECRET_KEY
    logger.info("[checkout] Stripe Session wird erstellt…")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "unit_amount": STRIPE_PRICE_CENTS,
                        "product_data": {
                            "name": f"Sommercamp 2026 – {child_name}",
                            "description": row.get("selected_camp_week", ""),
                        },
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=(
                f"{FRONTEND_URL}/?stripe=success&token={registration_token}"
            ),
            cancel_url=f"{FRONTEND_URL}/",
            customer_email=row.get("email") or None,
            metadata={
                "registration_id": reg_id,
                "registration_token": registration_token,
            },
        )
    except stripe.StripeError as exc:
        logger.error("[checkout] stripe.StripeError: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe-Fehler: {getattr(exc, 'user_message', None) or str(exc)}",
        )
    except Exception as exc:
        logger.error("[checkout] Unerwarteter Fehler bei Stripe Session: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Interner Fehler: {type(exc).__name__}: {exc}",
        )

    logger.info("[checkout] Stripe Session erstellt: %s", session.id)

    # stripe_session_id in DB speichern
    try:
        with db_cursor() as cur:
            cur.execute(
                "UPDATE camp_registrations SET stripe_session_id = %s WHERE id = %s",
                (session.id, reg_id),
            )
    except Exception as exc:
        # Nicht kritisch – Webhook kann Anmeldung auch per metadata.registration_id finden
        logger.warning("[checkout] stripe_session_id konnte nicht gespeichert werden: %s", exc)

    return {"checkout_url": session.url}


@app.post(
    "/stripe/webhook",
    tags=["Payment"],
    summary="Stripe Webhook Receiver",
    include_in_schema=False,
)
async def stripe_webhook(request: Request) -> JSONResponse:
    """
    Empfängt Stripe Webhook Events.

    - Signatur wird mit STRIPE_WEBHOOK_SECRET verifiziert → 400 bei Fehler.
    - checkout.session.completed → payment_status = paid, paid_at = now().
    - Alle anderen Events → 200 OK (ignoriert).
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not STRIPE_WEBHOOK_SECRET:
        return JSONResponse(
            status_code=400,
            content={"error": "Webhook-Secret nicht konfiguriert."},
        )

    stripe.api_key = STRIPE_SECRET_KEY

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except StripeSignatureError:
        print("[webhook] Ungültige Stripe-Signatur")
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except Exception as exc:
        print(f"[webhook] Ungültiger Payload: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    if event["type"] != "checkout.session.completed":
        # Irrelevantes Event – quittieren
        return JSONResponse(status_code=200, content={"received": True})

    session_obj = event["data"]["object"]
    stripe_session_id = getattr(session_obj, "id", None)

    metadata_obj = session_obj.metadata or {}
    try:
        metadata = metadata_obj.to_dict()
    except AttributeError:
        metadata = metadata_obj if isinstance(metadata_obj, dict) else {}

    registration_id = metadata.get("registration_id")
    registration_token = metadata.get("registration_token")

    if not registration_id:
        logger.warning(
            "Stripe Webhook: registration_id fehlt in metadata (session %s, token %s)",
            stripe_session_id, registration_token,
        )
        return JSONResponse(status_code=200, content={"received": True})

    try:
        with db_cursor() as cur:
            cur.execute(
                """
                UPDATE camp_registrations
                   SET payment_status = 'paid',
                       paid_at = now()
                 WHERE id = %s
                   AND payment_status != 'paid'
                RETURNING id
                """,
                (registration_id,),
            )
            updated = cur.fetchone()
    except Exception as exc:
        logger.error("Stripe Webhook DB-Fehler: %s", exc)
        # 200 zurückgeben damit Stripe nicht wiederholt – Fehler wird geloggt
        return JSONResponse(status_code=200, content={"received": True, "warning": "DB-Fehler"})

    if updated:
        logger.info("Stripe Zahlung verbucht: registration_id=%s", registration_id)
    else:
        logger.info("Stripe Webhook: Anmeldung %s bereits bezahlt oder nicht gefunden.", registration_id)

    return JSONResponse(status_code=200, content={"received": True})
