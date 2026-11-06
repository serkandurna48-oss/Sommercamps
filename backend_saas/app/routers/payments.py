"""
CampsPilot Stripe Connect payments.

Two charge paths, chosen per organization (payment_mode):
- destination (billing B2, preferred): the club has an active Stripe Connect
  Express account. Checkout Sessions are created on the PLATFORM with
  on_behalf_of = club (club is the merchant of record),
  transfer_data.destination = club and application_fee_amount = platform fee
  from app/fees.py. Confirmed by the platform webhook
  (/api/v1/payments/stripe/platform-webhook, STRIPE_PLATFORM_WEBHOOK_SECRET).
- direct (v1.1, legacy): Checkout Sessions on the club's linked Standard
  account, no application fee. Confirmed by the Connect webhook.
Card data never reaches CampsPilot.

Safety:
- Off by default, independently at service and organization level.
- Public clients can neither select a connected account nor alter prices.
- Registration token is a bearer capability; never log it or return PII.
- The Stripe-signed, connected-account webhook is authoritative for paid state.
- Waitlist, cancelled, waived, zero-price and previously paid records are excluded.
- Bank transfer remains available when Stripe is disabled.
"""
from __future__ import annotations

import logging
import re
import time
from uuid import UUID

from datetime import datetime
from typing import Literal, Optional

import stripe
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from psycopg2.extras import Json
from pydantic import BaseModel, ConfigDict, Field

from .. import db, fees, invoices
from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_org_access, require_platform_owner
from ..config import get_settings
from ..deps import get_tenant_context
from ..ratelimit import SlidingWindowLimiter, trusted_client_ip
from ..repositories import platform_roles
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Payments"])
ACCOUNT_ID = re.compile(r"^acct_[A-Za-z0-9]{8,}$")
CHECKOUT_ID = re.compile(r"^cs_(test_|live_)[A-Za-z0-9]+$")
PAYMENT_INTENT_ID = re.compile(r"^pi_[A-Za-z0-9]+$")
# Marks Stripe objects created by CampsPilot. Clubs may use the same connected
# account for other payments (fees, shop); those events are ignored, never
# answered with an error that makes Stripe retry and finally disable the endpoint.
CAMPSPILOT_MARKER = {"campspilot": "1"}
# Stripe calls must not hold DB connections for the SDK default of 80 s.
STRIPE_TIMEOUT_SECONDS = 10
# Per IP and per registration; each call can reach Stripe.
checkout_limiter = SlidingWindowLimiter(20, 3600.0)


class PaymentOptions(BaseModel):
    online_payment_available: bool


class CheckoutURL(BaseModel):
    url: str


class ConnectAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Must already be linked to the platform through Stripe Connect.
    stripe_account_id: str = Field(min_length=13, max_length=255)


class ConnectAccountStatus(BaseModel):
    configured: bool
    charges_enabled: bool
    online_payment_enabled: bool


def _stripe_dict(value):
    """Normalize stripe-python StripeObject responses (which have no .get)."""
    if isinstance(value, dict):
        return value
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    raise TypeError("Unexpected Stripe response shape")


def _stripe_client():
    settings = get_settings()
    key = settings.stripe_secret_key
    if not settings.stripe_checkout_enabled or not key or not settings.stripe_webhook_secret:
        # Never accept funds without a configured reconciliation webhook.
        raise HTTPException(503, "Online-Zahlung noch nicht vollständig eingerichtet")
    # Never accidentally use a live Stripe key against a staging database.
    production = settings.app_env.strip().lower() == "production"
    if (production and not key.startswith("sk_live_")) or (
        not production and not key.startswith("sk_test_")
    ):
        raise HTTPException(503, "Stripe-Schlüssel passt nicht zur Umgebung")
    stripe.api_key = key
    stripe.max_network_retries = 1
    if not isinstance(stripe.default_http_client, stripe.RequestsClient) or getattr(
        stripe.default_http_client, "_timeout", None
    ) != STRIPE_TIMEOUT_SECONDS:
        stripe.default_http_client = stripe.RequestsClient(timeout=STRIPE_TIMEOUT_SECONDS)
    return stripe


def _is_campspilot(obj: dict) -> bool:
    metadata = obj.get("metadata") or {}
    return isinstance(metadata, dict) and metadata.get("campspilot") == "1"


def _flag_for_review(organization_id, registration_id, reason: str) -> None:
    """Money arrived that CampsPilot did not book as paid. Make it findable for
    the platform owner (audit log) instead of only a log line. No PII; the
    internal row id, never the registration token (a bearer capability)."""
    logger.error("Stripe payment needs manual review (reason=%s)", reason)
    platform_roles.write_audit_log(
        actor_user_id=None, actor_email=None,
        action="stripe.payment_needs_review",
        organization_id=str(organization_id) if organization_id else None,
        target_type="registration",
        target_id=str(registration_id) if registration_id else None,
        metadata={"reason": reason},
    )


_ORG_PAYMENT_COLUMNS = """stripe_account_id, stripe_charges_enabled, online_payment_enabled,
    stripe_express_account_id, stripe_express_charges_enabled, stripe_express_payouts_enabled,
    stripe_express_details_submitted, stripe_express_requirements_due, stripe_express_synced_at"""


def _organization_payment_details(org_id):
    with db.get_cursor() as cur:
        cur.execute(f"select {_ORG_PAYMENT_COLUMNS} from organizations where id = %s", (org_id,))
        return cur.fetchone()


def _service_ready(settings) -> bool:
    """Legacy direct charges: secret key and Connect webhook secret."""
    return bool(
        getattr(settings, "stripe_checkout_enabled", False) and getattr(settings, "stripe_secret_key", None)
        and getattr(settings, "stripe_webhook_secret", None)
    )


def _express_ready(settings) -> bool:
    """Destination charges additionally need the platform webhook, which is
    the only place their payments are confirmed."""
    return _service_ready(settings) and bool(getattr(settings, "stripe_platform_webhook_secret", None))


def payment_mode(org: dict | None, express_ready: bool) -> tuple[Optional[str], Optional[str]]:
    """("destination", express_acct) | ("direct", standard_acct) | (None, None).
    An active Express account wins; a linked Standard account keeps working
    until the club has switched. Both paths need online_payment_enabled, the
    platform owner's per-club switch (the platform carries chargebacks of
    destination charges). Service-level switches are checked by the caller
    (_stripe_client / _service_ready)."""
    if not org or not org.get("online_payment_enabled"):
        return None, None
    express = org.get("stripe_express_account_id")
    if express_ready and express and ACCOUNT_ID.fullmatch(express) and org.get("stripe_express_charges_enabled"):
        return "destination", express
    legacy = org.get("stripe_account_id")
    if legacy and ACCOUNT_ID.fullmatch(legacy) and org.get("stripe_charges_enabled"):
        return "direct", legacy
    return None, None


def online_payment_available(organization_id) -> bool:
    """Single rule for camps and trainings (see payment_mode)."""
    settings = get_settings()
    if not _service_ready(settings):
        return False
    return payment_mode(_organization_payment_details(organization_id), _express_ready(settings))[0] is not None


@router.get(
    "/api/v1/organizations/{organization_slug}/camps/{camp_slug}/payment-options",
    response_model=PaymentOptions,
)
def get_payment_options(
    camp_slug: str,
    tenant: TenantContext = Depends(get_tenant_context),
) -> PaymentOptions:
    return PaymentOptions(online_payment_available=online_payment_available(tenant.organization_id))


@router.post(
    "/admin/organizations/{organization_slug}/stripe/connect-account",
    response_model=ConnectAccountStatus,
)
def connect_existing_stripe_account(
    organization_slug: str,
    body: ConnectAccountRequest,
    auth: AuthContext = Depends(require_platform_owner),
) -> ConnectAccountStatus:
    """Owner-only: attach a Stripe account already connected to this platform.
    Never accept arbitrary IDs from club admins or parents."""
    del auth
    organization = require_organization(organization_slug)
    if not ACCOUNT_ID.fullmatch(body.stripe_account_id):
        raise HTTPException(422, "Ungültige Stripe-Konto-ID")
    with db.get_cursor() as cur:
        cur.execute(
            """select 1 from organizations
               where stripe_express_account_id = %s or (stripe_account_id = %s and id <> %s)""",
            (body.stripe_account_id, body.stripe_account_id, organization["id"]),
        )
        if cur.fetchone():
            # One Stripe account belongs to exactly one club and one payment path.
            raise HTTPException(409, "Dieses Stripe-Konto ist bereits einem Verein zugeordnet")
    client = _stripe_client()
    try:
        account = _stripe_dict(client.Account.retrieve(body.stripe_account_id))
    except stripe.error.StripeError:
        raise HTTPException(422, "Stripe-Konto nicht verbunden oder nicht abrufbar") from None

    enabled = bool(account.get("charges_enabled") and account.get("payouts_enabled"))
    with db.get_cursor() as cur:
        cur.execute(
            """update organizations
               set stripe_account_id = %s, stripe_charges_enabled = %s,
                   online_payment_enabled = %s
               where id = %s
               returning stripe_charges_enabled, online_payment_enabled""",
            (body.stripe_account_id, enabled, enabled, organization["id"]),
        )
        row = cur.fetchone()
    logger.info("Stripe account connected (organization_slug=%s, enabled=%s)", organization_slug, enabled)
    return ConnectAccountStatus(
        configured=True, charges_enabled=row["stripe_charges_enabled"],
        online_payment_enabled=row["online_payment_enabled"],
    )


@router.post(
    "/api/v1/organizations/{organization_slug}/camps/{camp_slug}/registrations/{registration_token}/checkout",
    response_model=CheckoutURL,
)
def create_checkout(
    camp_slug: str,
    registration_token: UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    request: Request = None,
) -> CheckoutURL:
    client_ip = trusted_client_ip(request) if request is not None else None
    keys = [f"token:{registration_token}"] + ([f"ip:{client_ip}"] if client_ip else [])
    if not all(checkout_limiter.allow(key) for key in keys):
        raise HTTPException(429, "Zu viele Zahlungsversuche. Bitte versuchen Sie es später erneut.")
    client = _stripe_client()
    settings = get_settings()
    # Read without a lock; Stripe calls must never hold a row lock or a pooled
    # connection. Double clicks are made safe by a deterministic idempotency
    # key (same Stripe session) and a compare-and-set write below.
    with db.get_cursor() as cur:
        cur.execute(
            f"""select r.id, r.status, r.payment_status, r.stripe_checkout_session_id,
                      {', '.join('o.' + c.strip() for c in _ORG_PAYMENT_COLUMNS.split(','))},
                      c.title, c.price_cents, c.currency, c.status as camp_status, c.offer_id,
                      r.applied_price_cents, r.booked_price_cents, r.payment_method, r.created_at,
                      r.stripe_checkout_amount_cents, r.stripe_checkout_account_id,
                      r.stripe_charge_type, r.stripe_checkout_fee
               from camp_registrations r
               join organizations o on o.id = r.organization_id
               join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
               where r.registration_token = %s and r.organization_id = %s
                     and c.slug = %s""",
            (registration_token, tenant.organization_id, camp_slug),
        )
        booking = cur.fetchone()
    if not booking:
        raise HTTPException(404, "Anmeldung nicht gefunden")
    is_training = booking.get("offer_id") is not None
    if is_training and booking.get("payment_method") != "online":
        # Trainings are only charged when the parent chose online payment.
        raise HTTPException(409, "Für diese Buchung wurde keine Online-Zahlung gewählt")
    if booking["status"] not in ("registered", "confirmed") or booking["payment_status"] != "open":
        raise HTTPException(409, "Für diese Anmeldung ist keine Online-Zahlung möglich")
    if booking["camp_status"] != "published":
        raise HTTPException(409, "Dieses Camp ist nicht mehr veröffentlicht")
    mode, account = payment_mode(booking, _express_ready(settings))
    if mode is None:
        raise HTTPException(503, "Der Verein hat Online-Zahlung noch nicht aktiviert")
    # Training prices (member/non-member) are decided server-side at booking time
    # and live on the registration (admin-correctable).
    # Camps charge the price at booking time (a later price change does not
    # touch existing bookings); rows without it fall back to the camp price.
    booked = booking.get("booked_price_cents")
    amount = booking["applied_price_cents"] if is_training else (booked if booked is not None else booking["price_cents"])
    currency = (booking["currency"] or "").lower()
    if not isinstance(amount, int) or amount < 50 or currency != "eur":
        raise HTTPException(409, "Dieser Camp-Preis ist nicht für Stripe Checkout verfügbar")

    quote = None
    if mode == "destination":
        # Fee valid on the booking date, computed on the amount actually charged.
        rule = fees.effective_fee(tenant.organization_id, booking["created_at"])
        quote = fees.fee_quote(rule, amount)

    existing = booking.get("stripe_checkout_session_id")
    if existing:
        previous_mode = booking.get("stripe_charge_type") or "direct"
        previous_account = booking.get("stripe_checkout_account_id") or (account if previous_mode == mode else None)
        scope = {"stripe_account": previous_account} if previous_mode == "direct" else {}
        try:
            session = _stripe_dict(client.checkout.Session.retrieve(existing, **scope))
            if session.get("status") == "open" and session.get("url"):
                stored_amount = booking.get("stripe_checkout_amount_cents")
                stored_fee = (booking.get("stripe_checkout_fee") or {}).get("fee_cents")
                same = (
                    (stored_amount is None or stored_amount == amount)
                    and previous_mode == mode and previous_account == account
                    and (mode == "direct" or stored_fee == quote["fee_cents"])
                )
                if same:
                    return CheckoutURL(url=session["url"])
                # Price, fee or payment path changed since this session was
                # created: never reuse it. Close it and create a new one below.
                try:
                    client.checkout.Session.expire(existing, **scope)
                except stripe.error.StripeError:
                    raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
                session = {"status": "expired"}
            if session.get("status") == "complete" or session.get("payment_status") == "paid":
                # A completed Checkout can still have a pending asynchronous
                # payment. A second Session could charge twice.
                raise HTTPException(409, "Zahlung wird bereits verarbeitet")
            if session.get("status") != "expired":
                raise HTTPException(503, "Zahlungsstatus derzeit nicht eindeutig")
        except stripe.error.StripeError:
            logger.warning("Could not retrieve previous checkout session (organization_slug=%s)", tenant.slug)
            raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None

    # Only public camp title is sent; never send child/parent info or medical data.
    success = f"{settings.frontend_base_url}/pilot/{tenant.slug}/zahlung?result=success"
    cancel = f"{settings.frontend_base_url}/pilot/{tenant.slug}/zahlung?result=cancel"
    marker = {**CAMPSPILOT_MARKER, "organization_id": str(tenant.organization_id)}
    params = dict(
        mode="payment",
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": currency,
                "unit_amount": amount,
                "product_data": {"name": booking["title"][:120]},
            },
            "quantity": 1,
        }],
        success_url=success,
        cancel_url=cancel,
        client_reference_id=str(registration_token),
        metadata={**marker, "camp_slug": camp_slug},
    )
    if mode == "destination":
        # Platform charge: the club is merchant of record (on_behalf_of), the
        # funds go to the club, the platform fee is withheld automatically.
        intent_data = {"metadata": marker, "on_behalf_of": account, "transfer_data": {"destination": account}}
        if quote["fee_cents"] > 0:
            intent_data["application_fee_amount"] = quote["fee_cents"]
        params.update(
            payment_intent_data=intent_data,
            idempotency_key=(
                f"campspilot-dest-{registration_token}-{existing or 'first'}-{amount}-{quote['fee_cents']}-{account}"
            ),
        )
    else:
        params.update(
            # No application fee on legacy direct charges.
            payment_intent_data={"metadata": marker},
            stripe_account=account,
            # Same booking, same previous session, same price -> same Stripe session.
            idempotency_key=f"campspilot-{registration_token}-{existing or 'first'}-{amount}",
        )
    try:
        session = _stripe_dict(client.checkout.Session.create(**params))
    except stripe.error.StripeError:
        logger.warning("Checkout creation failed (organization_slug=%s, mode=%s)", tenant.slug, mode)
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None

    if not session.get("id") or not session.get("url"):
        raise HTTPException(503, "Zahlungsanbieter hat keine Zahlungsseite geliefert")
    with db.get_cursor() as cur:
        # Compare-and-set: only replace the session this request started from.
        cur.execute(
            """update camp_registrations
               set stripe_checkout_session_id = %s, stripe_checkout_amount_cents = %s,
                   stripe_checkout_currency = %s, stripe_checkout_account_id = %s,
                   stripe_charge_type = %s, stripe_checkout_fee = %s
               where id = %s and organization_id = %s
                     and payment_status = 'open' and status in ('registered', 'confirmed')
                     and (stripe_checkout_session_id is not distinct from %s
                          or stripe_checkout_session_id = %s)
               returning id""",
            (session["id"], amount, currency, account, mode, Json(quote) if quote else None,
             booking["id"], tenant.organization_id, existing, session["id"]),
        )
        if cur.fetchone() is None:
            raise HTTPException(409, "Die Anmeldung wurde inzwischen geändert. Bitte laden Sie die Seite neu.")
    return CheckoutURL(url=session["url"])


@router.post("/api/v1/payments/stripe/webhook")
async def stripe_connect_webhook(
    request: Request,
    stripe_signature: str | None = Header(None),
    background_tasks: BackgroundTasks = None,
):
    """Connect endpoint: events on connected accounts (legacy direct-charge
    payments, account.updated for Express accounts)."""
    settings = get_settings()
    if not settings.stripe_checkout_enabled or not settings.stripe_webhook_secret:
        raise HTTPException(503, "Stripe-Webhooks nicht konfiguriert")
    # Raw body for the signature check; everything after runs in a worker
    # thread so blocking DB/Stripe calls never stall the single event loop.
    body = await request.body()
    result = await run_in_threadpool(_handle_webhook, body, stripe_signature or "")
    return await _with_invoice_sync(result, background_tasks)


def _verified_event(client, body: bytes, signature: str, secret: str) -> dict:
    try:
        event = client.Webhook.construct_event(body, signature, secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(400, "Ungültige Stripe-Signatur") from None
    # stripe-python returns an Event (StripeObject), not a plain dict.
    # Convert after signature verification so all subsequent .get calls work.
    event = _stripe_dict(event)
    expected_live = get_settings().app_env.strip().lower() == "production"
    if event.get("livemode") is not expected_live:
        raise HTTPException(400, "Falscher Stripe-Modus")
    return event


def _handle_webhook(body: bytes, signature: str) -> dict:
    settings = get_settings()
    client = _stripe_client()
    event = _verified_event(client, body, signature, settings.stripe_webhook_secret)
    account = event.get("account")
    if not account or not ACCOUNT_ID.fullmatch(account):
        # Direct charges must originate on a connected account.
        raise HTTPException(400, "Stripe-Konto fehlt")

    event_type = event["type"]
    obj = _stripe_dict(_stripe_dict(event["data"])["object"])
    if event_type == "account.updated":
        # Express onboarding progress; Standard accounts are not tracked here.
        store_express_status(account, obj, event.get("created"))
        return {"received": True}
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if not _is_campspilot(obj):
            # The club's own payments on the same account: not ours, no retry.
            return {"received": True, "ignored": True}
        if obj.get("payment_status") != "paid":
            return {"received": True, "settled": False}
        return _settle_checkout(client, obj, account, event.get("created"))

    if event_type == "charge.refunded":
        refunded = _record_refund(obj, account)
        return {"received": True, **({"_sync": refunded} if refunded else {})}
    return {"received": True}


@router.post("/api/v1/payments/stripe/platform-webhook")
async def stripe_platform_webhook(
    request: Request,
    stripe_signature: str | None = Header(None),
    background_tasks: BackgroundTasks = None,
):
    """Platform endpoint: destination-charge Checkout Sessions live on the
    platform account. Own signing secret (STRIPE_PLATFORM_WEBHOOK_SECRET)."""
    if not _express_ready(get_settings()):
        raise HTTPException(503, "Stripe-Webhooks nicht konfiguriert")
    body = await request.body()
    result = await run_in_threadpool(_handle_platform_webhook, body, stripe_signature or "")
    return await _with_invoice_sync(result, background_tasks)


async def _with_invoice_sync(result: dict, background_tasks: BackgroundTasks | None) -> dict:
    """Invoices and storno invoices (PDF + parent mail) after Stripe got its
    answer: never part of the webhook's success, never retried by Stripe.
    The invoice code is idempotent, so a replayed event changes nothing."""
    target = result.pop("_sync", None)
    if target:
        if background_tasks is not None:
            background_tasks.add_task(invoices.sync_registration, *target)
        else:  # direct call (tests): run inline
            await run_in_threadpool(invoices.sync_registration, *target)
    return result


def _handle_platform_webhook(body: bytes, signature: str) -> dict:
    settings = get_settings()
    client = _stripe_client()
    event = _verified_event(client, body, signature, settings.stripe_platform_webhook_secret)
    if event.get("account"):
        # Connected-account events belong to the Connect endpoint.
        raise HTTPException(400, "Ereignis eines verbundenen Kontos am Plattform-Endpunkt")
    event_type = event["type"]
    obj = _stripe_dict(_stripe_dict(event["data"])["object"])
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if not _is_campspilot(obj):
            return {"received": True, "ignored": True}
        if obj.get("payment_status") != "paid":
            return {"received": True, "settled": False}
        return _settle_checkout(client, obj, None, event.get("created"), mode="destination")
    if event_type in ("charge.refunded", "charge.refund.updated"):
        refunded = _record_destination_refund(client, obj)
        return {"received": True, **({"_sync": refunded} if refunded else {})}
    return {"received": True}


def _fully_refunded(client, payment_intent: str, account: str | None) -> bool:
    """Refunds can arrive before the completed event was processed (retries,
    outages). Ask Stripe for the current state instead of trusting the order.
    account=None: platform charge (destination)."""
    scope = {"stripe_account": account} if account else {}
    try:
        intent = _stripe_dict(client.PaymentIntent.retrieve(
            payment_intent, expand=["latest_charge"], **scope,
        ))
    except stripe.error.StripeError:
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
    charge = intent.get("latest_charge")
    if not isinstance(charge, dict):
        return False
    return bool(charge.get("refunded")) and charge.get("amount_refunded") == charge.get("amount")


# A marked session that still has no matching row after this long is not a
# commit race any more (account changed, data removed): flag it, stop retries.
UNMATCHED_RETRY_SECONDS = 6 * 3600

_SETTLE_DIRECT = """select r.id, r.organization_id, r.registration_token, r.payment_status, r.status,
                      r.stripe_checkout_amount_cents, r.stripe_checkout_currency,
                      r.stripe_payment_intent_id
               from camp_registrations r
               join organizations o on o.id = r.organization_id
               where r.stripe_checkout_session_id = %s
                     and r.stripe_checkout_account_id = %s
                     and o.stripe_account_id = %s
                     and r.stripe_charge_type is distinct from 'destination'
               for update of r"""

_SETTLE_DESTINATION = """select r.id, r.organization_id, r.registration_token, r.payment_status, r.status,
                      r.stripe_checkout_amount_cents, r.stripe_checkout_currency,
                      r.stripe_payment_intent_id, r.stripe_checkout_fee
               from camp_registrations r
               join organizations o on o.id = r.organization_id
               where r.stripe_checkout_session_id = %s
                     and r.stripe_charge_type = 'destination'
                     and r.stripe_checkout_account_id = o.stripe_express_account_id
               for update of r"""


def _settle_checkout(client, obj: dict, account: str | None, created=None, mode: str = "direct") -> dict:
    session_id = obj.get("id")
    paid_amount = obj.get("amount_total")
    paid_currency = (obj.get("currency") or "").lower()
    payment_intent = obj.get("payment_intent")
    if not isinstance(session_id, str) or not isinstance(paid_amount, int):
        raise HTTPException(400, "Stripe-Zahlungsdaten unvollständig")
    if not isinstance(payment_intent, str) or not PAYMENT_INTENT_ID.fullmatch(payment_intent):
        raise HTTPException(400, "Ungültiger Stripe-PaymentIntent")
    # Outside the row lock: a Stripe call must never hold a DB lock.
    refund_state = None
    if mode == "destination":
        refund_state = _destination_refund_state(client, payment_intent)
        refunded = refund_state["status"] == "refunded"
    else:
        refunded = _fully_refunded(client, payment_intent, account)
    review = None
    settled = None
    with db.get_cursor() as cur:
        if mode == "destination":
            cur.execute(_SETTLE_DESTINATION, (session_id,))
        else:
            cur.execute(_SETTLE_DIRECT, (session_id, account, account))
        row = cur.fetchone()
        if row is None:
            if isinstance(created, int) and time.time() - created > UNMATCHED_RETRY_SECONDS:
                review = "unmatched_session"
            else:
                # Our marker is set, so the row exists or is about to commit.
                raise HTTPException(503, "Stripe-Zahlung noch nicht zuordenbar")
        elif row["stripe_checkout_amount_cents"] != paid_amount or row["stripe_checkout_currency"] != paid_currency:
            # 200: a retry cannot fix a wrong amount; flag it for a human.
            review = "amount_mismatch"
        elif (row["payment_status"] in ("paid", "partially_refunded", "refunded")
              and row.get("stripe_payment_intent_id") == payment_intent):
            return {"received": True, "settled": True}  # replay of an already booked payment
        elif row["payment_status"] == "paid":
            # Paid by transfer or another charge: a second payment arrived.
            review = "duplicate_payment"
        elif row["status"] not in ("registered", "confirmed") or row["payment_status"] != "open":
            # Never restore cancelled/waived/refunded registrations.
            review = "payment_for_closed_registration"
        else:
            status = refund_state["status"] if refund_state else ("refunded" if refunded else "paid")
            cur.execute(
                """update camp_registrations set payment_status = %s,
                       stripe_payment_intent_id = %s, paid_at = now()
                   where id = %s and payment_status = 'open'""",
                (status, payment_intent, row["id"]),
            )
            _snapshot_settled(cur, row, mode)
            if refund_state and refund_state["refunded_cents"] > 0:
                # A refund that arrived before this event (retries, outages).
                _store_refund(cur, row["id"], refund_state)
            settled = (row["id"], row["organization_id"])
    if review:
        _flag_for_review(row["organization_id"] if row else None, row["id"] if row else None, review)
        return {"received": True, "settled": False}
    return {"received": True, "settled": True, **({"_sync": settled} if settled else {})}


def _snapshot_settled(cur, row: dict, mode: str) -> None:
    """Freeze the platform fee in the same transaction as the paid state.
    Destination: exactly the fee given to Stripe at checkout (withheld).
    Direct: the fee owed, not withheld (legacy accounts)."""
    quote = row.get("stripe_checkout_fee") if mode == "destination" else None
    if isinstance(quote, dict) and isinstance(quote.get("fee_cents"), int):
        fees.write_snapshot(cur, row["id"], row["organization_id"], quote, "application_fee")
        return
    if mode == "destination":
        logger.error("Destination payment without stored fee quote; snapshot computed instead")
    fees.snapshot_paid_registration(cur, row["id"], row["organization_id"])


def _record_refund(obj: dict, account: str):
    """Legacy direct charge, full refunds only. Returns (registration_id,
    organization_id) when a booking changed."""
    intent = obj.get("payment_intent")
    # Do not mark partially refunded payments as fully refunded.
    if not (
        isinstance(intent, str) and PAYMENT_INTENT_ID.fullmatch(intent)
        and obj.get("refunded") is True
        and obj.get("amount_refunded") == obj.get("amount")
    ):
        return None
    # No matching row: either not ours, or the payment is not settled yet;
    # _settle_checkout then reads the refund from Stripe itself.
    with db.get_cursor() as cur:
        cur.execute(
            """update camp_registrations r set payment_status = 'refunded',
                   refunded_cents = r.stripe_checkout_amount_cents, refunded_at = now(),
                   fee_refunded_cents = r.fee_cents
               from organizations o
               where o.id = r.organization_id
                 and o.stripe_account_id = %s
                 and r.stripe_checkout_account_id = %s
                 and r.stripe_payment_intent_id = %s
                 and r.payment_status = 'paid'
                 and r.stripe_charge_type is distinct from 'destination'
               returning r.id, r.organization_id, r.refunded_cents, r.fee_refunded_cents""",
            (account, account, intent),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cur.execute(
            """insert into registration_refund_events
                   (organization_id, registration_id, refunded_delta_cents, fee_delta_cents, source)
               values (%s, %s, %s, %s, 'stripe')""",
            (row["organization_id"], row["id"], row.get("refunded_cents") or 0, row.get("fee_refunded_cents") or 0),
        )
    return (row["id"], row["organization_id"])


def _destination_refund_state(client, payment_intent: str) -> dict:
    """Current refund state of a platform charge, read from Stripe (event
    order is not guaranteed; charge.refunded is cumulative anyway).
    fee_refunded_cents is what Stripe actually returned of the application
    fee (refund_application_fee=true refunds it proportionally)."""
    try:
        intent = _stripe_dict(client.PaymentIntent.retrieve(
            payment_intent, expand=["latest_charge.application_fee"],
        ))
    except stripe.error.StripeError:
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
    charge = intent.get("latest_charge")
    charge = _stripe_dict(charge) if charge is not None and not isinstance(charge, (str, dict)) else charge
    if not isinstance(charge, dict):
        return {"status": "paid", "refunded_cents": 0, "fee_refunded_cents": 0}
    amount = charge.get("amount") if isinstance(charge.get("amount"), int) else 0
    refunded = charge.get("amount_refunded") if isinstance(charge.get("amount_refunded"), int) else 0
    fee = charge.get("application_fee")
    fee = _stripe_dict(fee) if fee is not None and not isinstance(fee, (str, dict)) else fee
    fee_refunded = fee.get("amount_refunded") if isinstance(fee, dict) and isinstance(fee.get("amount_refunded"), int) else 0
    if refunded > 0 and not isinstance(fee, dict) and charge.get("application_fee_amount"):
        # Fee object not expanded: never guess, let Stripe retry.
        raise HTTPException(503, "Gebührenerstattung noch nicht abrufbar")
    if amount > 0 and refunded >= amount:
        status = "refunded"
    elif refunded > 0:
        status = "partially_refunded"
    else:
        status = "paid"
    return {"status": status, "refunded_cents": refunded, "fee_refunded_cents": fee_refunded}


def _store_refund(cur, registration_id, state: dict) -> bool:
    """Never moves backwards: an older event cannot shrink a stored refund.
    Every increase is also logged as a refund event (month of the refund,
    for the fee invoice). Returns True when something changed."""
    cur.execute(
        """select organization_id, coalesce(refunded_cents, 0) as refunded, coalesce(fee_refunded_cents, 0) as fee,
                  payment_status
           from camp_registrations where id = %s for update""",
        (registration_id,),
    )
    before = cur.fetchone()
    if before is None:
        return False
    cur.execute(
        """update camp_registrations
           set refunded_cents = greatest(coalesce(refunded_cents, 0), %s),
               fee_refunded_cents = least(coalesce(fee_cents, 0),
                                          greatest(coalesce(fee_refunded_cents, 0), %s)),
               refunded_at = coalesce(refunded_at, now()),
               payment_status = case
                   when payment_status = 'refunded' then 'refunded'
                   when %s = 'refunded' then 'refunded'
                   when %s = 'partially_refunded' then 'partially_refunded'
                   else payment_status end
           where id = %s and payment_status in ('paid', 'partially_refunded', 'refunded')""",
        (state["refunded_cents"], state["fee_refunded_cents"], state["status"], state["status"], registration_id),
    )
    cur.execute(
        """select coalesce(refunded_cents, 0) as refunded, coalesce(fee_refunded_cents, 0) as fee, payment_status
           from camp_registrations where id = %s""",
        (registration_id,),
    )
    after = cur.fetchone()
    delta, fee_delta = after["refunded"] - before["refunded"], after["fee"] - before["fee"]
    if delta or fee_delta:
        cur.execute(
            """insert into registration_refund_events
                   (organization_id, registration_id, refunded_delta_cents, fee_delta_cents, source)
               values (%s, %s, %s, %s, 'stripe')""",
            (before["organization_id"], registration_id, delta, fee_delta),
        )
    return bool(delta or fee_delta or after["payment_status"] != before["payment_status"])


def _record_destination_refund(client, obj: dict):
    """Returns (registration_id, organization_id) when the refund changed the booking."""
    intent = obj.get("payment_intent")
    if not isinstance(intent, str) or not PAYMENT_INTENT_ID.fullmatch(intent):
        return
    with db.get_cursor() as cur:
        cur.execute(
            """select id, organization_id from camp_registrations
               where stripe_charge_type = 'destination' and stripe_payment_intent_id = %s""",
            (intent,),
        )
        row = cur.fetchone()
    if row is None:
        # Not ours, or not settled yet: _settle_checkout reads the refund itself.
        return None
    state = _destination_refund_state(client, intent)  # outside any lock
    if state["refunded_cents"] <= 0:
        return None
    with db.get_cursor() as cur:
        changed = _store_refund(cur, row["id"], state)
    return (row["id"], row["organization_id"]) if changed else None


def expire_open_checkout(organization_id, registration_token) -> None:
    """Best effort after cancel, waive or a manually booked payment: close a
    still-open Checkout so parents cannot pay a booking that is settled.
    Runs as a background task; never raises."""
    settings = get_settings()
    if not (settings.stripe_checkout_enabled and settings.stripe_secret_key and settings.stripe_webhook_secret):
        return
    try:
        with db.get_cursor() as cur:
            cur.execute(
                """select stripe_checkout_session_id, stripe_checkout_account_id, payment_status, status,
                          stripe_charge_type
                   from camp_registrations
                   where organization_id = %s and registration_token = %s""",
                (organization_id, registration_token),
            )
            row = cur.fetchone()
        if not row or not row["stripe_checkout_session_id"] or not row["stripe_checkout_account_id"]:
            return
        if row["payment_status"] == "open" and row["status"] in ("registered", "confirmed"):
            return  # still payable: keep the session
        client = _stripe_client()
        # Destination sessions live on the platform account.
        scope = {} if row.get("stripe_charge_type") == "destination" else {
            "stripe_account": row["stripe_checkout_account_id"]}
        session = _stripe_dict(client.checkout.Session.retrieve(row["stripe_checkout_session_id"], **scope))
        if session.get("status") == "open":
            client.checkout.Session.expire(row["stripe_checkout_session_id"], **scope)
    except Exception:  # noqa: BLE001 - best effort, the webhook flags late payments
        logger.warning("Could not expire open Stripe checkout")


# ---------------------------------------------------------------------------
# Billing B2: Stripe Connect Express onboarding (club admin) and refunds
# ---------------------------------------------------------------------------

class ExpressStatus(BaseModel):
    """What the club admin sees in Einstellungen → Zahlungen. No account ids."""

    # awaiting_approval: Stripe is ready, the platform owner has not enabled
    # online payment for this club yet (online_payment_enabled).
    state: Literal["not_set_up", "incomplete", "awaiting_approval", "active"]
    platform_enabled: bool
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    requirements_due: int
    synced_at: Optional[datetime] = None
    legacy_account_linked: bool
    legacy_active: bool
    online_payment_mode: Optional[Literal["destination", "direct"]] = None
    # Platform side configured for Express in this environment.
    service_ready: bool


class OnboardingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Only used when the account is created: e.V. → non_profit, GmbH/UG → company.
    business_type: Literal["company", "non_profit"] = "non_profit"


class OnboardingLink(BaseModel):
    url: str


class RefundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # None = the whole remaining amount. Partial refunds return the platform
    # fee proportionally.
    amount_cents: Optional[int] = Field(default=None, ge=1, le=10_000_000)
    # Client-generated id of this refund intent: a double click (same id) is
    # one refund, a second deliberate refund of the same amount (new id) is not.
    request_id: UUID


class RefundResult(BaseModel):
    status: str
    amount_cents: int


class OnlinePaymentSwitch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


# Each call reaches Stripe; per organization.
stripe_admin_limiter = SlidingWindowLimiter(20, 3600.0)


def _limit_stripe_admin(organization_id) -> None:
    if not stripe_admin_limiter.allow(f"org:{organization_id}"):
        raise HTTPException(429, "Zu viele Anfragen an Stripe. Bitte versuch es in einer Stunde noch einmal.")


def _express_status(org: dict, settings) -> ExpressStatus:
    has_express = bool(org.get("stripe_express_account_id"))
    platform_enabled = bool(org.get("online_payment_enabled"))
    if not has_express:
        state = "not_set_up"
    elif org.get("stripe_express_charges_enabled") and org.get("stripe_express_details_submitted"):
        state = "active" if platform_enabled else "awaiting_approval"
    else:
        state = "incomplete"
    mode, _ = payment_mode(org, _express_ready(settings)) if _service_ready(settings) else (None, None)
    return ExpressStatus(
        state=state,
        platform_enabled=platform_enabled,
        charges_enabled=bool(org.get("stripe_express_charges_enabled")),
        payouts_enabled=bool(org.get("stripe_express_payouts_enabled")),
        details_submitted=bool(org.get("stripe_express_details_submitted")),
        requirements_due=int(org.get("stripe_express_requirements_due") or 0),
        synced_at=org.get("stripe_express_synced_at"),
        legacy_account_linked=bool(org.get("stripe_account_id")),
        legacy_active=bool(org.get("stripe_account_id") and org.get("stripe_charges_enabled") and platform_enabled),
        online_payment_mode=mode,
        service_ready=_express_ready(settings),
    )


def _account_values(account: dict) -> tuple[bool, bool, bool, int]:
    requirements = account.get("requirements") or {}
    if not isinstance(requirements, dict):
        requirements = _stripe_dict(requirements)
    due = set(requirements.get("currently_due") or []) | set(requirements.get("past_due") or [])
    return (
        bool(account.get("charges_enabled")), bool(account.get("payouts_enabled")),
        bool(account.get("details_submitted")), len(due),
    )


def store_express_status(account_id: str, account: dict, event_created: int | None = None) -> bool:
    """Write the Express account state. Webhook events older than the last
    stored state are skipped (Stripe does not guarantee event order)."""
    charges, payouts, details, due = _account_values(account)
    created = event_created if isinstance(event_created, int) else None
    with db.get_cursor() as cur:
        cur.execute(
            """update organizations
               set stripe_express_charges_enabled = %s, stripe_express_payouts_enabled = %s,
                   stripe_express_details_submitted = %s, stripe_express_requirements_due = %s,
                   stripe_express_synced_at = coalesce(to_timestamp(%s::bigint), now())
               where stripe_express_account_id = %s
                 and (%s::bigint is null or stripe_express_synced_at is null
                      or stripe_express_synced_at <= to_timestamp(%s::bigint))
               returning id""",
            (charges, payouts, details, due, created, account_id, created, created),
        )
        return cur.fetchone() is not None


def _payment_org(organization_id) -> dict:
    org = _organization_payment_details(organization_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org


@router.get("/admin/organizations/{organization_slug}/payments/stripe", response_model=ExpressStatus)
def get_express_status(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> ExpressStatus:
    del auth
    organization = require_organization(organization_slug)
    return _express_status(_payment_org(organization["id"]), get_settings())


def _require_express_service():
    settings = get_settings()
    if not _express_ready(settings):
        raise HTTPException(503, "Online-Zahlung ist in dieser Umgebung noch nicht eingerichtet")
    if not settings.frontend_base_is_usable():
        raise HTTPException(503, "FRONTEND_BASE_URL fehlt")
    return settings


@router.post("/admin/organizations/{organization_slug}/payments/stripe/onboarding", response_model=OnboardingLink)
def start_express_onboarding(
    organization_slug: str,
    body: OnboardingRequest | None = None,
    auth: AuthContext = Depends(require_org_access),
) -> OnboardingLink:
    """Create the club's Express account once, then hand out a fresh Stripe
    onboarding link (links are single-use and expire after minutes)."""
    organization = require_organization(organization_slug)
    settings = _require_express_service()
    _limit_stripe_admin(organization["id"])
    client = _stripe_client()
    business_type = (body or OnboardingRequest()).business_type
    org = _payment_org(organization["id"])
    account_id = org.get("stripe_express_account_id")
    created = False
    if not account_id:
        try:
            account = _stripe_dict(client.Account.create(
                type="express",
                country="DE",
                business_type=business_type,
                capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
                metadata={**CAMPSPILOT_MARKER, "organization_id": str(organization["id"])},
                # Two clicks (or a retry after a lost response) get the same account.
                idempotency_key=f"campspilot-express-{organization['id']}",
            ))
        except stripe.error.StripeError:
            logger.warning("Express account creation failed (organization_slug=%s)", organization_slug)
            raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
        new_id = account.get("id")
        if not isinstance(new_id, str) or not ACCOUNT_ID.fullmatch(new_id):
            raise HTTPException(503, "Zahlungsanbieter hat kein Konto geliefert")
        with db.get_cursor() as cur:
            cur.execute(
                """update organizations set stripe_express_account_id = %s, stripe_express_business_type = %s
                   where id = %s and stripe_express_account_id is null
                   returning stripe_express_account_id""",
                (new_id, business_type, organization["id"]),
            )
            stored = cur.fetchone()
        if stored is None:
            account_id = _payment_org(organization["id"]).get("stripe_express_account_id")
            if not account_id:
                raise HTTPException(409, "Bitte die Seite neu laden")
        else:
            account_id, created = new_id, True
            store_express_status(account_id, account)
    base = f"{settings.frontend_base_url}/pilot/{organization_slug}/konfiguration"
    try:
        link = _stripe_dict(client.AccountLink.create(
            account=account_id,
            refresh_url=f"{base}?stripe=refresh#zahlungen",
            return_url=f"{base}?stripe=return#zahlungen",
            type="account_onboarding",
        ))
    except stripe.error.StripeError:
        logger.warning("Account link creation failed (organization_slug=%s)", organization_slug)
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
    url = link.get("url")
    if not isinstance(url, str) or not url.startswith("https://connect.stripe.com/"):
        raise HTTPException(503, "Zahlungsanbieter hat keinen Link geliefert")
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="stripe.express_onboarding_started",
        organization_id=str(organization["id"]), target_type="organization", target_id=organization_slug,
        metadata={"account_created": created},
    )
    return OnboardingLink(url=url)


@router.post("/admin/organizations/{organization_slug}/payments/stripe/sync", response_model=ExpressStatus)
def sync_express_status(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> ExpressStatus:
    """"Status prüfen": read the Express account from Stripe now."""
    del auth
    organization = require_organization(organization_slug)
    settings = _require_express_service()
    org = _payment_org(organization["id"])
    account_id = org.get("stripe_express_account_id")
    if account_id:
        _limit_stripe_admin(organization["id"])
        client = _stripe_client()
        try:
            account = _stripe_dict(client.Account.retrieve(account_id))
        except stripe.error.StripeError:
            raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
        store_express_status(account_id, account)
        org = _payment_org(organization["id"])
    return _express_status(org, settings)


@router.patch("/admin/platform/organizations/{organization_slug}/online-payment", response_model=ExpressStatus)
def set_online_payment_enabled(
    organization_slug: str,
    body: OnlinePaymentSwitch,
    auth: AuthContext = Depends(require_platform_owner),
) -> ExpressStatus:
    """Platform owner's per-club switch for online payment (both paths).
    Off: no new Checkout Sessions; already paid bookings are unaffected."""
    organization = require_organization(organization_slug)
    with db.get_cursor() as cur:
        cur.execute("update organizations set online_payment_enabled = %s where id = %s",
                    (body.enabled, organization["id"]))
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="organization.online_payment_switched",
        organization_id=str(organization["id"]), target_type="organization", target_id=organization_slug,
        metadata={"enabled": body.enabled},
    )
    return _express_status(_payment_org(organization["id"]), get_settings())


_REFUND_ERRORS = {
    "charge_already_refunded": (409, "Diese Zahlung ist bereits vollständig erstattet."),
    "insufficient_funds": (409, "Das Stripe-Guthaben des Vereins reicht für die Rückbuchung gerade nicht aus."),
    "balance_insufficient": (409, "Das Stripe-Guthaben des Vereins reicht für die Rückbuchung gerade nicht aus."),
    "charge_disputed": (409, "Die Zahlung wird gerade angefochten und kann nicht erstattet werden."),
    "amount_too_large": (422, "Betrag höher als der noch erstattbare Rest."),
}


@router.post("/admin/organizations/{organization_slug}/registrations/{registration_token}/refund", response_model=RefundResult)
def refund_destination_payment(
    organization_slug: str,
    registration_token: UUID,
    body: RefundRequest,
    auth: AuthContext = Depends(require_org_access),
) -> RefundResult:
    """Refund an online payment made through the platform (destination
    charge). The transfer to the club is reversed and the platform fee is
    returned proportionally. Status and refunded amounts are booked by the
    platform webhook (charge.refunded) from Stripe's own numbers."""
    organization = require_organization(organization_slug)
    with db.get_cursor() as cur:
        cur.execute(
            """select id, payment_status, stripe_payment_intent_id, stripe_charge_type,
                      stripe_checkout_amount_cents, refunded_cents
               from camp_registrations
               where organization_id = %s and registration_token = %s""",
            (organization["id"], registration_token),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "Registration not found")
    if row["stripe_charge_type"] != "destination" or not row["stripe_payment_intent_id"]:
        raise HTTPException(409, "Diese Zahlung lief nicht über CampsPilot. Bitte im eigenen Stripe-Konto erstatten.")
    if row["payment_status"] not in ("paid", "partially_refunded"):
        raise HTTPException(409, "Nur bezahlte Online-Zahlungen können erstattet werden")
    remaining = (row["stripe_checkout_amount_cents"] or 0) - (row["refunded_cents"] or 0)
    amount = body.amount_cents if body.amount_cents is not None else remaining
    if amount <= 0 or amount > remaining:
        raise HTTPException(422, "Betrag höher als der noch erstattbare Rest")
    if not _express_ready(get_settings()):
        raise HTTPException(503, "Online-Zahlung ist in dieser Umgebung noch nicht eingerichtet")
    client = _stripe_client()
    try:
        refund = _stripe_dict(client.Refund.create(
            payment_intent=row["stripe_payment_intent_id"],
            amount=amount,
            refund_application_fee=True,
            reverse_transfer=True,
            metadata={**CAMPSPILOT_MARKER, "organization_id": str(organization["id"])},
            idempotency_key=f"campspilot-refund-{row['id']}-{amount}-{body.request_id}",
        ))
    except stripe.error.InvalidRequestError as error:
        status_code, message = _REFUND_ERRORS.get(
            getattr(error, "code", None) or "", (502, "Stripe hat die Erstattung abgelehnt. Bitte prüfe sie im Stripe-Dashboard."))
        logger.warning("Refund rejected by Stripe (organization_slug=%s, code=%s)", organization_slug, getattr(error, "code", None))
        raise HTTPException(status_code, message) from None
    except stripe.error.StripeError:
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
    refunded = refund.get("amount") if isinstance(refund.get("amount"), int) else amount
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="stripe.refund_requested",
        organization_id=str(organization["id"]), target_type="registration", target_id=str(row["id"]),
        metadata={"amount_cents": refunded, "full": refunded >= remaining},
    )
    return RefundResult(status=str(refund.get("status") or "pending"), amount_cents=refunded)
