"""
CampsPilot Stripe Connect payments v1.1.

Direct charges: Stripe Checkout Sessions are created on the club's connected
Stripe account. CampsPilot never receives the camp funds or card data.

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

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from .. import db
from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_platform_owner
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


def _flag_for_review(organization_id, registration_token, reason: str) -> None:
    """Money arrived that CampsPilot did not book as paid. Make it findable for
    the platform owner (audit log) instead of only a log line. No PII."""
    logger.error("Stripe payment needs manual review (reason=%s)", reason)
    platform_roles.write_audit_log(
        actor_user_id=None, actor_email=None,
        action="stripe.payment_needs_review",
        organization_id=str(organization_id) if organization_id else None,
        target_type="registration",
        target_id=str(registration_token) if registration_token else None,
        metadata={"reason": reason},
    )


def _organization_payment_details(org_id):
    with db.get_cursor() as cur:
        cur.execute(
            """select stripe_account_id, stripe_charges_enabled, online_payment_enabled
               from organizations where id = %s""", (org_id,)
        )
        return cur.fetchone()


@router.get(
    "/api/v1/organizations/{organization_slug}/camps/{camp_slug}/payment-options",
    response_model=PaymentOptions,
)
def get_payment_options(
    camp_slug: str,
    tenant: TenantContext = Depends(get_tenant_context),
) -> PaymentOptions:
    settings = get_settings()
    if not (settings.stripe_checkout_enabled and settings.stripe_secret_key and settings.stripe_webhook_secret):
        return PaymentOptions(online_payment_available=False)
    org = _organization_payment_details(tenant.organization_id)
    return PaymentOptions(
        online_payment_available=bool(
            org and org["online_payment_enabled"] and org["stripe_charges_enabled"]
            and org["stripe_account_id"]
        )
    )


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
            """select r.id, r.status, r.payment_status, r.stripe_checkout_session_id,
                      o.stripe_account_id, o.stripe_charges_enabled, o.online_payment_enabled,
                      c.title, c.price_cents, c.currency, c.status as camp_status
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
    if booking["status"] not in ("registered", "confirmed") or booking["payment_status"] != "open":
        raise HTTPException(409, "Für diese Anmeldung ist keine Online-Zahlung möglich")
    if booking["camp_status"] != "published":
        raise HTTPException(409, "Dieses Camp ist nicht mehr veröffentlicht")
    account = booking["stripe_account_id"]
    if not (
        account and ACCOUNT_ID.fullmatch(account)
        and booking["stripe_charges_enabled"] and booking["online_payment_enabled"]
    ):
        raise HTTPException(503, "Der Verein hat Online-Zahlung noch nicht aktiviert")
    amount = booking["price_cents"]
    currency = (booking["currency"] or "").lower()
    if not isinstance(amount, int) or amount < 50 or currency != "eur":
        raise HTTPException(409, "Dieser Camp-Preis ist nicht für Stripe Checkout verfügbar")

    existing = booking.get("stripe_checkout_session_id")
    if existing:
        try:
            session = _stripe_dict(client.checkout.Session.retrieve(existing, stripe_account=account))
            if session.get("status") == "open" and session.get("url"):
                return CheckoutURL(url=session["url"])
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
    try:
        session = _stripe_dict(client.checkout.Session.create(
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
            # No application fee; SaaS subscription is billed separately.
            metadata={**CAMPSPILOT_MARKER, "organization_id": str(tenant.organization_id), "camp_slug": camp_slug},
            payment_intent_data={"metadata": {**CAMPSPILOT_MARKER, "organization_id": str(tenant.organization_id)}},
            stripe_account=account,
            # Same booking, same previous session, same price -> same Stripe session.
        idempotency_key=f"campspilot-{registration_token}-{existing or 'first'}-{amount}",
        ))
    except stripe.error.StripeError:
        logger.warning("Checkout creation failed (organization_slug=%s)", tenant.slug)
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None

    if not session.get("id") or not session.get("url"):
        raise HTTPException(503, "Zahlungsanbieter hat keine Zahlungsseite geliefert")
    with db.get_cursor() as cur:
        # Compare-and-set: only replace the session this request started from.
        cur.execute(
            """update camp_registrations
               set stripe_checkout_session_id = %s, stripe_checkout_amount_cents = %s,
                   stripe_checkout_currency = %s, stripe_checkout_account_id = %s
               where id = %s and organization_id = %s
                     and payment_status = 'open' and status in ('registered', 'confirmed')
                     and (stripe_checkout_session_id is not distinct from %s
                          or stripe_checkout_session_id = %s)
               returning id""",
            (session["id"], amount, currency, account, booking["id"], tenant.organization_id,
             existing, session["id"]),
        )
        if cur.fetchone() is None:
            raise HTTPException(409, "Die Anmeldung wurde inzwischen geändert. Bitte laden Sie die Seite neu.")
    return CheckoutURL(url=session["url"])


@router.post("/api/v1/payments/stripe/webhook")
async def stripe_connect_webhook(
    request: Request,
    stripe_signature: str | None = Header(None),
):
    settings = get_settings()
    if not settings.stripe_checkout_enabled or not settings.stripe_webhook_secret:
        raise HTTPException(503, "Stripe-Webhooks nicht konfiguriert")
    # Raw body for the signature check; everything after runs in a worker
    # thread so blocking DB/Stripe calls never stall the single event loop.
    body = await request.body()
    return await run_in_threadpool(_handle_webhook, body, stripe_signature or "")


def _handle_webhook(body: bytes, signature: str) -> dict:
    settings = get_settings()
    client = _stripe_client()
    try:
        event = client.Webhook.construct_event(body, signature, settings.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(400, "Ungültige Stripe-Signatur") from None

    # stripe-python returns an Event (StripeObject), not a plain dict.
    # Convert after signature verification so all subsequent .get calls work.
    event = _stripe_dict(event)

    expected_live = settings.app_env.strip().lower() == "production"
    if event.get("livemode") is not expected_live:
        raise HTTPException(400, "Falscher Stripe-Modus")
    account = event.get("account")
    if not account or not ACCOUNT_ID.fullmatch(account):
        # Direct charges must originate on a connected account.
        raise HTTPException(400, "Stripe-Konto fehlt")

    event_type = event["type"]
    obj = _stripe_dict(_stripe_dict(event["data"])["object"])
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if not _is_campspilot(obj):
            # The club's own payments on the same account: not ours, no retry.
            return {"received": True, "ignored": True}
        if obj.get("payment_status") != "paid":
            return {"received": True, "settled": False}
        return _settle_checkout(client, obj, account, event.get("created"))

    if event_type == "charge.refunded":
        _record_refund(obj, account)
    return {"received": True}


def _fully_refunded(client, payment_intent: str, account: str) -> bool:
    """Refunds can arrive before the completed event was processed (retries,
    outages). Ask Stripe for the current state instead of trusting the order."""
    try:
        intent = _stripe_dict(client.PaymentIntent.retrieve(
            payment_intent, expand=["latest_charge"], stripe_account=account,
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


def _settle_checkout(client, obj: dict, account: str, created=None) -> dict:
    session_id = obj.get("id")
    paid_amount = obj.get("amount_total")
    paid_currency = (obj.get("currency") or "").lower()
    payment_intent = obj.get("payment_intent")
    if not isinstance(session_id, str) or not isinstance(paid_amount, int):
        raise HTTPException(400, "Stripe-Zahlungsdaten unvollständig")
    if not isinstance(payment_intent, str) or not PAYMENT_INTENT_ID.fullmatch(payment_intent):
        raise HTTPException(400, "Ungültiger Stripe-PaymentIntent")
    # Outside the row lock: a Stripe call must never hold a DB lock.
    refunded = _fully_refunded(client, payment_intent, account)
    review = None
    with db.get_cursor() as cur:
        cur.execute(
            """select r.id, r.organization_id, r.registration_token, r.payment_status, r.status,
                      r.stripe_checkout_amount_cents, r.stripe_checkout_currency,
                      r.stripe_payment_intent_id
               from camp_registrations r
               join organizations o on o.id = r.organization_id
               where r.stripe_checkout_session_id = %s
                     and r.stripe_checkout_account_id = %s
                     and o.stripe_account_id = %s
               for update of r""",
            (session_id, account, account),
        )
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
        elif row["payment_status"] in ("paid", "refunded") and row.get("stripe_payment_intent_id") == payment_intent:
            return {"received": True, "settled": True}  # replay of an already booked payment
        elif row["payment_status"] == "paid":
            # Paid by transfer or another charge: a second payment arrived.
            review = "duplicate_payment"
        elif row["status"] not in ("registered", "confirmed") or row["payment_status"] != "open":
            # Never restore cancelled/waived/refunded registrations.
            review = "payment_for_closed_registration"
        else:
            cur.execute(
                """update camp_registrations set payment_status = %s,
                       stripe_payment_intent_id = %s, paid_at = now()
                   where id = %s and payment_status = 'open'""",
                ("refunded" if refunded else "paid", payment_intent, row["id"]),
            )
    if review:
        _flag_for_review(row["organization_id"] if row else None, row["registration_token"] if row else None, review)
        return {"received": True, "settled": False}
    return {"received": True, "settled": True}


def _record_refund(obj: dict, account: str) -> None:
    intent = obj.get("payment_intent")
    # Do not mark partially refunded payments as fully refunded.
    if not (
        isinstance(intent, str) and PAYMENT_INTENT_ID.fullmatch(intent)
        and obj.get("refunded") is True
        and obj.get("amount_refunded") == obj.get("amount")
    ):
        return
    # No matching row: either not ours, or the payment is not settled yet;
    # _settle_checkout then reads the refund from Stripe itself.
    with db.get_cursor() as cur:
        cur.execute(
            """update camp_registrations r set payment_status = 'refunded'
               from organizations o
               where o.id = r.organization_id
                 and o.stripe_account_id = %s
                 and r.stripe_checkout_account_id = %s
                 and r.stripe_payment_intent_id = %s
                 and r.payment_status = 'paid'""",
            (account, account, intent),
        )


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
                """select stripe_checkout_session_id, stripe_checkout_account_id, payment_status, status
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
        session = _stripe_dict(client.checkout.Session.retrieve(
            row["stripe_checkout_session_id"], stripe_account=row["stripe_checkout_account_id"],
        ))
        if session.get("status") == "open":
            client.checkout.Session.expire(
                row["stripe_checkout_session_id"], stripe_account=row["stripe_checkout_account_id"],
            )
    except Exception:  # noqa: BLE001 - best effort, the webhook flags late payments
        logger.warning("Could not expire open Stripe checkout")
