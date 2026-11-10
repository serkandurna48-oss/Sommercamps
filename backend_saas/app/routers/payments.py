"""
CampsPilot Stripe Connect payments.

Four charge paths, chosen per organization (payment_mode):
- platform (default for every club the owner enables, decision 10.11.2026): the
  parents pay on CampsPilot's OWN Stripe account (Checkout Session on the
  platform, no club account, no application fee, no transfer). The platform
  keeps its fee (plan percent, which includes the Stripe fees) and pays the
  rest out to the club by bank transfer outside the system (payout ledger,
  GET /admin/platform/organizations/{slug}/payouts). Confirmed by the platform
  webhook. No club Stripe onboarding.
- direct_fee (Managed Risk, default for new clubs): the club has an Accounts v2
  connected account (full Stripe Dashboard, fees_collector = losses_collector =
  stripe). Checkout Sessions are created ON the club's account (direct charge,
  club is merchant of record and pays the Stripe fees) with
  application_fee_amount = platform fee from app/fees.py. Confirmed by the
  Connect webhook (events from connected accounts).
- destination (billing B2, staging only): Express account with platform loss
  liability. Checkout Sessions on the PLATFORM with on_behalf_of and
  transfer_data.destination. Confirmed by the platform webhook
  (/api/v1/payments/stripe/platform-webhook, STRIPE_PLATFORM_WEBHOOK_SECRET).
  Kept working for accounts already created that way; no new ones.
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

import hashlib
import json
import logging
import re
import time
from uuid import UUID

import datetime as _dt
from datetime import date, datetime
from typing import Literal, Optional

import stripe
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Path, Query, Request
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
DIRECT_FEE, DESTINATION, PLATFORM = "direct_fee", "destination", "platform"
# Paths that withhold the platform fee at Stripe (application_fee_amount).
FEE_MODES = (DESTINATION, DIRECT_FEE)
# Paths whose Checkout Session lives on the connected account (Stripe-Account header).
CONNECTED_MODES = ("direct", DIRECT_FEE)
# Paths whose Checkout Session and PaymentIntent live on the platform account
# (no Stripe-Account header): CampsPilot can refund them itself.
PLATFORM_ACCOUNT_MODES = (DESTINATION, PLATFORM)
# Hosted onboarding: v1 AccountLink (connect.stripe.com) or v2 account link (accounts.stripe.com).
ONBOARDING_URL_PREFIXES = ("https://connect.stripe.com/", "https://accounts.stripe.com/")
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


def _stripe_v2():
    """StripeClient for the Accounts v2 endpoints, with the same key and
    environment checks as _stripe_client."""
    _stripe_client()
    return stripe.StripeClient(
        get_settings().stripe_secret_key,
        http_client=stripe.RequestsClient(timeout=STRIPE_TIMEOUT_SECONDS),
        max_network_retries=1,
    )


def _is_campspilot(obj: dict) -> bool:
    metadata = obj.get("metadata") or {}
    return isinstance(metadata, dict) and metadata.get("campspilot") == "1"


def _flag_for_review(organization_id, registration_id, reason: str, checkout_session_id=None) -> None:
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
        metadata={"reason": reason, **({"checkout_session_id": checkout_session_id}
                                        if isinstance(checkout_session_id, str) and CHECKOUT_ID.fullmatch(checkout_session_id) else {})},
    )


_ORG_PAYMENT_COLUMNS = """stripe_account_id, stripe_charges_enabled, online_payment_enabled,
    stripe_express_account_id, stripe_express_charges_enabled, stripe_express_payouts_enabled,
    stripe_express_details_submitted, stripe_express_requirements_due, stripe_express_synced_at,
    stripe_express_account_kind"""


def _organization_payment_details(org_id):
    with db.get_cursor() as cur:
        cur.execute(f"select {_ORG_PAYMENT_COLUMNS} from organizations where id = %s", (org_id,))
        return cur.fetchone()


def _service_ready(settings) -> bool:
    """Direct charges (legacy and Managed Risk direct_fee): secret key and
    Connect webhook secret. The platform webhook secret is not needed."""
    return bool(
        getattr(settings, "stripe_checkout_enabled", False) and getattr(settings, "stripe_secret_key", None)
        and getattr(settings, "stripe_webhook_secret", None)
    )


def _express_ready(settings) -> bool:
    """Destination charges additionally need the platform webhook, which is
    the only place their payments are confirmed."""
    return _service_ready(settings) and bool(getattr(settings, "stripe_platform_webhook_secret", None))


def express_kind(org: dict | None) -> Optional[str]:
    """Payment path of the account in stripe_express_account_id. Accounts
    stored before the kind column existed are B2 Express (destination)."""
    if not org or not org.get("stripe_express_account_id"):
        return None
    return DIRECT_FEE if org.get("stripe_express_account_kind") == DIRECT_FEE else DESTINATION


def payment_mode(org: dict | None, express_ready: bool) -> tuple[Optional[str], Optional[str]]:
    """("direct_fee" | "destination", acct) | ("direct", standard_acct) | ("platform", None) | (None, None).
    An active club account (stripe_express_account_id) wins; a linked Standard
    account keeps working until the club has switched; without an active club
    account the platform collects ("platform"). Every path needs
    online_payment_enabled, the platform owner's per-club switch.
    express_ready (platform webhook secret) gates destination and platform charges.
    Service-level switches are checked by the caller (_stripe_client /
    _service_ready)."""
    if not org or not org.get("online_payment_enabled"):
        return None, None
    express = org.get("stripe_express_account_id")
    if express and ACCOUNT_ID.fullmatch(express) and org.get("stripe_express_charges_enabled"):
        kind = express_kind(org)
        if kind == DIRECT_FEE:
            return DIRECT_FEE, express
        if express_ready:
            return DESTINATION, express
    legacy = org.get("stripe_account_id")
    if legacy and ACCOUNT_ID.fullmatch(legacy) and org.get("stripe_charges_enabled"):
        return "direct", legacy
    # No active club account: the platform collects (needs the platform webhook).
    if express_ready:
        return PLATFORM, None
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
    # Camps with a member price store the decided price in applied_price_cents too.
    booked = booking.get("booked_price_cents")
    applied = booking.get("applied_price_cents")
    amount = applied if is_training or applied is not None else (booked if booked is not None else booking["price_cents"])
    currency = (booking["currency"] or "").lower()
    if not isinstance(amount, int) or amount < 50 or currency != "eur":
        raise HTTPException(409, "Dieser Camp-Preis ist nicht für Stripe Checkout verfügbar")

    quote = None
    if mode in FEE_MODES or mode == PLATFORM:
        # Fee valid on the booking date, computed on the amount actually charged.
        rule = fees.effective_fee(tenant.organization_id, booking["created_at"])
        quote = fees.fee_quote(rule, amount)
        # PLATFORM: the full plan fee; the platform pays the Stripe fees itself.
        if mode == DIRECT_FEE:
            # Stripe charges its fee to the club's account: withhold only the rest,
            # so the club pays the plan percent in total (Ahmad's pricing).
            quote = fees.net_of_payment_fee(quote, amount, settings.stripe_fee_percent, settings.stripe_fee_fixed_cents)
        if mode != PLATFORM and quote["fee_cents"] >= amount:
            # Stripe: application_fee_amount must be less than the charge.
            # Only possible with an extreme minimum fee; the snapshot keeps
            # the capped value, which is what Stripe withholds.
            logger.warning("Platform fee capped below the charge amount (organization_slug=%s)", tenant.slug)
            quote = {**quote, "fee_cents": amount - 1}

    existing = booking.get("stripe_checkout_session_id")
    if existing:
        previous_mode = booking.get("stripe_charge_type") or "direct"
        previous_account = booking.get("stripe_checkout_account_id") or (account if previous_mode == mode else None)
        scope = {"stripe_account": previous_account} if previous_mode in CONNECTED_MODES else {}
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
        # No payment_method_types: Stripe API 2026-10-28 rejects it; payment methods
        # are configured in the Stripe Dashboard (platform settings for connected
        # accounts). Async methods are settled via checkout.session.async_payment_succeeded.
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
                f"campspilot-dest-v2-{registration_token}-{existing or 'first'}-{amount}-{quote['fee_cents']}-{account}"
            ),
        )
    elif mode == PLATFORM:
        # Platform charge, no club account: no stripe_account, no application
        # fee, no transfer_data. The platform pays the club out afterwards.
        params.update(
            metadata={**params["metadata"], "charge_type": PLATFORM},
            payment_intent_data={"metadata": marker},
            idempotency_key=f"campspilot-plat-v2-{registration_token}-{existing or 'first'}-{amount}",
        )
    elif mode == DIRECT_FEE:
        # Direct charge on the club's account (Managed Risk): the club is
        # merchant of record and pays the Stripe fees; the platform fee goes to
        # the platform as application fee. No transfer_data, no on_behalf_of.
        intent_data = {"metadata": marker}
        if quote["fee_cents"] > 0:
            intent_data["application_fee_amount"] = quote["fee_cents"]
        params.update(
            metadata={**params["metadata"], "charge_type": DIRECT_FEE},
            payment_intent_data=intent_data,
            stripe_account=account,
            idempotency_key=(
                f"campspilot-dfee-v2-{registration_token}-{existing or 'first'}-{amount}-{quote['fee_cents']}-{account}"
            ),
        )
    else:
        params.update(
            # No application fee on legacy direct charges.
            payment_intent_data={"metadata": marker},
            stripe_account=account,
            # Same booking, same previous session, same price -> same Stripe session.
            idempotency_key=f"campspilot-v2-{registration_token}-{existing or 'first'}-{amount}",
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
    """Connect endpoint: events on connected accounts (direct charges of
    Managed Risk accounts and legacy Standard accounts, account.updated)."""
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
        # Onboarding progress of club accounts (v1 snapshot event, also sent
        # for Accounts v2); Standard accounts are not tracked here.
        store_express_status(account, obj, event.get("created"))
        return {"received": True}
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if not _is_campspilot(obj):
            # The club's own payments on the same account: not ours, no retry.
            return {"received": True, "ignored": True}
        if obj.get("payment_status") != "paid":
            return {"received": True, "settled": False}
        # Set by CampsPilot at checkout. Only selects which booking query runs;
        # each query also checks the stored charge type and account, so a wrong
        # value can never book a payment, it only fails to match.
        metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        mode = DIRECT_FEE if metadata.get("charge_type") == DIRECT_FEE else "direct"
        return _settle_checkout(client, obj, account, event.get("created"), mode=mode)

    if event_type in ("charge.refunded", "charge.refund.updated"):
        # Legacy (Standard account, no fee): full refunds only, from the charge
        # itself. Otherwise a direct charge with platform fee: amounts are read
        # from Stripe. Each lookup also checks charge type and account.
        _flag_failed_refund(event_type, obj, DIRECT_FEE, account)
        refunded = _record_refund(obj, account) if event_type == "charge.refunded" else None
        if refunded is None:
            refunded = _record_fee_refund(client, obj, DIRECT_FEE, account)
        return {"received": True, **({"_sync": refunded} if refunded else {})}
    return {"received": True}


@router.post("/api/v1/payments/stripe/platform-webhook")
async def stripe_platform_webhook(
    request: Request,
    stripe_signature: str | None = Header(None),
    background_tasks: BackgroundTasks = None,
):
    """Platform endpoint: platform and destination-charge Checkout Sessions
    live on the platform account. Own signing secret (STRIPE_PLATFORM_WEBHOOK_SECRET)."""
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
        # Only selects which booking query runs; each query also checks the
        # stored charge type, so a wrong value can never book a payment.
        metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        mode = PLATFORM if metadata.get("charge_type") == PLATFORM else DESTINATION
        return _settle_checkout(client, obj, None, event.get("created"), mode=mode)
    if event_type in ("charge.refunded", "charge.refund.updated"):
        _flag_failed_refund(event_type, obj, PLATFORM_ACCOUNT_MODES, None)
        refunded = _record_fee_refund(client, obj, PLATFORM_ACCOUNT_MODES, None)
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
                     and coalesce(r.stripe_charge_type, 'direct') = 'direct'
               for update of r"""

_SETTLE_DIRECT_FEE = """select r.id, r.organization_id, r.registration_token, r.payment_status, r.status,
                      r.stripe_checkout_amount_cents, r.stripe_checkout_currency,
                      r.stripe_payment_intent_id, r.stripe_checkout_fee
               from camp_registrations r
               join organizations o on o.id = r.organization_id
               where r.stripe_checkout_session_id = %s
                     and r.stripe_checkout_account_id = %s
                     and o.stripe_express_account_id = %s
                     and r.stripe_charge_type = 'direct_fee'
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


_SETTLE_PLATFORM = """select r.id, r.organization_id, r.registration_token, r.payment_status, r.status,
                      r.stripe_checkout_amount_cents, r.stripe_checkout_currency,
                      r.stripe_payment_intent_id, r.stripe_checkout_fee
               from camp_registrations r
               where r.stripe_checkout_session_id = %s
                     and r.stripe_charge_type = 'platform'
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
    if mode in FEE_MODES or mode == PLATFORM:
        # account is None for destination and platform (platform charges).
        refund_state = _fee_refund_state(client, payment_intent, account if mode == DIRECT_FEE else None,
                                         strict=False, platform=mode == PLATFORM)
        refunded = refund_state["status"] == "refunded"
    else:
        refunded = _fully_refunded(client, payment_intent, account)
    review = None
    settled = None
    fee_mismatch = False
    with db.get_cursor() as cur:
        if mode == PLATFORM:
            cur.execute(_SETTLE_PLATFORM, (session_id,))
        elif mode == DESTINATION:
            cur.execute(_SETTLE_DESTINATION, (session_id,))
        elif mode == DIRECT_FEE:
            cur.execute(_SETTLE_DIRECT_FEE, (session_id, account, account))
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
            # Replay of an already booked payment: no booking change, but retry a
            # missing or failed invoice (idempotent).
            return {"received": True, "settled": True, "_sync": (row["id"], row["organization_id"])}
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
            fee_mismatch = mode in FEE_MODES and _fee_differs(row.get("stripe_checkout_fee"), refund_state)
    if settled and fee_mismatch:
        # Paid is right (the money arrived); the withheld fee differs from the
        # quote the snapshot keeps. Never expected, since only CampsPilot
        # creates these sessions: flag it for a human, no retry.
        _flag_for_review(settled[1], settled[0], "fee_mismatch")
    if review:
        # Row gone (e.g. deleted): the session still names the club. Never log
        # the registration token (client_reference_id), it is a bearer capability.
        metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        _flag_for_review(
            row["organization_id"] if row else metadata.get("organization_id"),
            row["id"] if row else None,
            review,
            None if row else obj.get("id"),
        )
        return {"received": True, "settled": False}
    return {"received": True, "settled": True, **({"_sync": settled} if settled else {})}


def _fee_differs(quote, refund_state: dict | None) -> bool:
    """Application fee Stripe actually holds vs. the quote sent at checkout
    (application_fee_amount is omitted when the quote is 0)."""
    if not isinstance(quote, dict) or not isinstance(quote.get("fee_cents"), int) or not refund_state:
        return False
    actual = refund_state.get("application_fee_amount")
    return (actual if isinstance(actual, int) else 0) != quote["fee_cents"]


def _snapshot_settled(cur, row: dict, mode: str) -> None:
    """Freeze the platform fee in the same transaction as the paid state.
    direct_fee / destination: exactly the fee given to Stripe at checkout
    (withheld as application fee). platform: the quoted fee, kept by the
    platform (platform_collected). Direct: the fee owed, not withheld (legacy
    accounts)."""
    quote = row.get("stripe_checkout_fee") if mode in FEE_MODES or mode == PLATFORM else None
    if isinstance(quote, dict) and isinstance(quote.get("fee_cents"), int):
        fees.write_snapshot(cur, row["id"], row["organization_id"], quote,
                            "platform_collected" if mode == PLATFORM else "application_fee")
        return
    if mode in FEE_MODES or mode == PLATFORM:
        logger.error("Online payment without stored fee quote; snapshot computed instead (mode=%s)", mode)
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
                 and coalesce(r.stripe_charge_type, 'direct') = 'direct'
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


def _fee_refund_state(client, payment_intent: str, account: str | None = None, strict: bool = True,
                      platform: bool = False) -> dict:
    """Current refund state of a charge with platform fee, read from Stripe
    (event order is not guaranteed; charge.refunded is cumulative anyway).
    account=None: platform charge (destination); otherwise the club's
    connected account (direct_fee). fee_refunded_cents is what Stripe actually
    returned of the application fee (refund_application_fee=true refunds it
    proportionally).

    Only latest_charge is expanded. The ApplicationFee (on the platform
    account, created asynchronously for direct charges) is read only when
    something was refunded. strict=False (booking a payment): a failed fee
    lookup never blocks the paid state; fee_refunded_cents stays 0 and the
    next refund event (strict) records it.

    platform=True: no application fee exists at Stripe; the whole plan fee is
    the platform's, so _store_refund gives it back proportionally to the
    refunded amount (fee_proportional)."""
    scope = {"stripe_account": account} if account else {}
    try:
        intent = _stripe_dict(client.PaymentIntent.retrieve(payment_intent, expand=["latest_charge"], **scope))
    except stripe.error.StripeError:
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
    charge = intent.get("latest_charge")
    charge = _stripe_dict(charge) if charge is not None and not isinstance(charge, (str, dict)) else charge
    if not isinstance(charge, dict):
        return {"status": "paid", "refunded_cents": 0, "fee_refunded_cents": 0, "application_fee_amount": None,
                "fee_proportional": platform}
    amount = charge.get("amount") if isinstance(charge.get("amount"), int) else 0
    refunded = charge.get("amount_refunded") if isinstance(charge.get("amount_refunded"), int) else 0
    fee_amount = charge.get("application_fee_amount") if isinstance(charge.get("application_fee_amount"), int) else 0
    fee_refunded = 0
    if refunded > 0 and fee_amount > 0 and not platform:
        try:
            fee_refunded = _application_fee_refunded(client, charge.get("application_fee"))
        except HTTPException:
            if strict:
                raise
            logger.warning("Application fee refund not readable yet; booked later (mode=%s)",
                           DIRECT_FEE if account else DESTINATION)
    if amount > 0 and refunded >= amount:
        status = "refunded"
    elif refunded > 0:
        status = "partially_refunded"
    else:
        status = "paid"
    return {"status": status, "refunded_cents": refunded, "fee_refunded_cents": fee_refunded,
            "application_fee_amount": charge.get("application_fee_amount"), "fee_proportional": platform}


def _application_fee_refunded(client, fee) -> int:
    """amount_refunded of the charge's ApplicationFee. It lives on the
    platform account: read without the Stripe-Account header. Not created yet
    or not readable: 503, Stripe retries the event."""
    fee = _stripe_dict(fee) if fee is not None and not isinstance(fee, (str, dict)) else fee
    if isinstance(fee, str) and fee.startswith("fee_"):
        try:
            fee = _stripe_dict(client.ApplicationFee.retrieve(fee))
        except stripe.error.StripeError:
            raise HTTPException(503, "Gebührenerstattung noch nicht abrufbar") from None
    if not isinstance(fee, dict) or not isinstance(fee.get("amount_refunded"), int):
        # Never guess the returned fee.
        raise HTTPException(503, "Gebührenerstattung noch nicht abrufbar")
    return fee["amount_refunded"]


def _store_refund(cur, registration_id, state: dict) -> bool:
    """Never moves backwards: an older event cannot shrink a stored refund.
    Every increase is also logged as a refund event (month of the refund,
    for the fee invoice). Returns True when something changed."""
    cur.execute(
        """select organization_id, coalesce(refunded_cents, 0) as refunded, coalesce(fee_refunded_cents, 0) as fee,
                  payment_status, coalesce(fee_cents, 0) as fee_cents,
                  coalesce(stripe_checkout_amount_cents, 0) as charged
           from camp_registrations where id = %s for update""",
        (registration_id,),
    )
    before = cur.fetchone()
    if before is None:
        return False
    if state.get("fee_proportional"):
        # Platform charge: the fee comes back in proportion to the refund
        # (whole fee on a full refund), half-up like the fee itself.
        charged = before["charged"]
        if charged > 0 and state["refunded_cents"] >= charged:
            state = {**state, "fee_refunded_cents": before["fee_cents"]}
        elif charged > 0:
            share = (before["fee_cents"] * state["refunded_cents"] * 2 + charged) // (2 * charged)
            state = {**state, "fee_refunded_cents": min(before["fee_cents"], share)}
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


def _charge_types(charge_type) -> list[str]:
    return [charge_type] if isinstance(charge_type, str) else list(charge_type)


def _flag_failed_refund(event_type: str, obj: dict, charge_type, account: str | None) -> None:
    """A refund that Stripe reports as failed or canceled (charge.refund.updated) means the
    money did not go back: make it findable. Never raises into the webhook."""
    if event_type != "charge.refund.updated" or obj.get("status") not in REFUND_FAILED_STATUSES:
        return
    intent = obj.get("payment_intent")
    if not isinstance(intent, str) or not PAYMENT_INTENT_ID.fullmatch(intent):
        return
    try:
        with db.get_cursor() as cur:
            cur.execute(
                """select id, organization_id from camp_registrations
                   where stripe_charge_type = any(%s) and stripe_payment_intent_id = %s
                     and (%s::text is null or stripe_checkout_account_id = %s)""",
                (_charge_types(charge_type), intent, account, account),
            )
            row = cur.fetchone()
        if row is not None:
            _flag_for_review(row["organization_id"], row["id"], "refund_failed")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not flag failed refund (error_type=%s)", type(exc).__name__)


def _record_fee_refund(client, obj: dict, charge_type, account: str | None):
    """Refund of a charge with platform fee (destination: account None;
    direct_fee: the connected account the event came from). Returns
    (registration_id, organization_id) when the refund changed the booking."""
    intent = obj.get("payment_intent")
    if not isinstance(intent, str) or not PAYMENT_INTENT_ID.fullmatch(intent):
        return None
    with db.get_cursor() as cur:
        cur.execute(
            """select id, organization_id, stripe_charge_type from camp_registrations
               where stripe_charge_type = any(%s) and stripe_payment_intent_id = %s
                 and (%s::text is null or stripe_checkout_account_id = %s)""",
            (_charge_types(charge_type), intent, account, account),
        )
        row = cur.fetchone()
    if row is None:
        # Not ours, or not settled yet: _settle_checkout reads the refund itself.
        return None
    state = _fee_refund_state(client, intent, account, platform=row["stripe_charge_type"] == PLATFORM)  # outside any lock
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
        if not row or not row["stripe_checkout_session_id"]:
            return
        if row.get("stripe_charge_type") != PLATFORM and not row["stripe_checkout_account_id"]:
            return
        if row["payment_status"] == "open" and row["status"] in ("registered", "confirmed"):
            return  # still payable: keep the session
        _expire_session(row["stripe_checkout_session_id"], _session_scope(row))
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
    online_payment_mode: Optional[Literal["direct_fee", "destination", "direct", "platform"]] = None
    # Payment path of the club account (None = no account yet).
    account_kind: Optional[Literal["direct_fee", "destination"]] = None
    # Platform side configured for online payment in this environment.
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
    kind = express_kind(org)
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
        account_kind=kind,
        # Destination accounts (B2) additionally need the platform webhook.
        service_ready=_service_ready(settings) and (kind != DESTINATION or _express_ready(settings)),
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
    """Onboarding and "Status prüfen": the Connect webhook is enough (new
    accounts are direct charges, confirmed there)."""
    settings = get_settings()
    if not _service_ready(settings):
        raise HTTPException(503, "Online-Zahlung ist in dieser Umgebung noch nicht eingerichtet")
    if not settings.frontend_base_is_usable():
        raise HTTPException(503, "FRONTEND_BASE_URL fehlt")
    return settings


def _stripe_setup_error(error: Exception, step: str, organization_slug: str) -> HTTPException:
    """Map a Stripe error during Express setup. Configuration problems (invalid
    request, missing permission, wrong key) are shown to the admin with Stripe's
    own reason so they can be fixed in the dashboard; network trouble stays 503."""
    code = getattr(error, "code", None)
    reason = getattr(error, "user_message", None) or getattr(error, "_message", None) or str(error)
    reason = " ".join(str(reason).split())[:300]
    logger.warning(
        "Stripe %s failed (organization_slug=%s, error_type=%s, code=%s, reason=%s)",
        step, organization_slug, type(error).__name__, code, reason,
    )
    status = getattr(error, "http_status", None)
    if isinstance(error, (stripe.error.InvalidRequestError, stripe.error.PermissionError,
                          stripe.error.AuthenticationError, stripe.error.IdempotencyError)) or (
        # Typed v2 errors (feature not enabled, blocked by Stripe, ...) are no
        # InvalidRequestError but still a configuration answer from Stripe.
        isinstance(status, int) and 400 <= status < 500 and status != 429
    ):
        return HTTPException(409, f"Stripe hat die Einrichtung abgelehnt: {reason}")
    return HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar")


def _club_contact(organization_id) -> tuple[Optional[str], Optional[str]]:
    """(display name, e-mail) for the new Stripe account: billing e-mail
    first, else the club's contact e-mail. Never parent or child data."""
    with db.get_cursor() as cur:
        cur.execute(
            """select o.name, o.contact_email, b.invoice_email
               from organizations o
               left join organization_billing_profiles b on b.organization_id = o.id
               where o.id = %s""",
            (organization_id,),
        )
        row = cur.fetchone() or {}
    email = next((e.strip() for e in (row.get("invoice_email"), row.get("contact_email"))
                  if isinstance(e, str) and "@" in e and len(e.strip()) <= 254), None)
    name = (row.get("name") or "").strip()[:100] or None
    return name, email


def _params_hash(params: dict) -> str:
    return hashlib.sha256(json.dumps(params, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]


def account_v2_params(organization_id, business_type: str, name: Optional[str], email: Optional[str]) -> dict:
    """Accounts v2 with Managed Risk: Stripe collects requirements, charges the
    Stripe fees to the club and carries negative balances (losses_collector).
    Full Stripe Dashboard: no preview API version needed."""
    params: dict = {
        "dashboard": "full",
        # Our business_type values are the v2 entity types (e.V. -> non_profit).
        "identity": {"country": "de", "entity_type": business_type},
        "defaults": {
            "currency": "eur",
            "locales": ["de-DE"],
            "responsibilities": {"fees_collector": "stripe", "losses_collector": "stripe"},
        },
        "configuration": {"merchant": {"capabilities": {"card_payments": {"requested": True}}}},
        "metadata": {**CAMPSPILOT_MARKER, "organization_id": str(organization_id)},
    }
    if email:
        params["contact_email"] = email
    if name:
        params["display_name"] = name
    return params


@router.post("/admin/organizations/{organization_slug}/payments/stripe/onboarding", response_model=OnboardingLink)
def start_express_onboarding(
    organization_slug: str,
    body: OnboardingRequest | None = None,
    auth: AuthContext = Depends(require_org_access),
) -> OnboardingLink:
    """Create the club's Stripe account once (Accounts v2, Managed Risk), then
    hand out a fresh Stripe onboarding link (links are single-use and expire
    after minutes)."""
    organization = require_organization(organization_slug)
    settings = _require_express_service()
    _limit_stripe_admin(organization["id"])
    client = _stripe_client()
    business_type = (body or OnboardingRequest()).business_type
    org = _payment_org(organization["id"])
    account_id = org.get("stripe_express_account_id")
    kind = express_kind(org)
    created = False
    if not account_id:
        name, email = _club_contact(organization["id"])
        params = account_v2_params(organization["id"], business_type, name, email)
        try:
            account = _stripe_dict(_stripe_v2().v2.core.accounts.create(
                params,
                # Two clicks (or a retry after a lost response) get the same
                # account. Changed data (legal form, e-mail) gets a new key, so
                # a corrected retry is not refused as idempotency_error.
                {"idempotency_key": f"campspilot-acct-v2-{organization['id']}-{_params_hash(params)}"},
            ))
        except stripe.error.StripeError as error:
            raise _stripe_setup_error(error, "account creation", organization_slug) from None
        new_id = account.get("id")
        if not isinstance(new_id, str) or not ACCOUNT_ID.fullmatch(new_id):
            raise HTTPException(503, "Zahlungsanbieter hat kein Konto geliefert")
        with db.get_cursor() as cur:
            cur.execute(
                """update organizations set stripe_express_account_id = %s, stripe_express_business_type = %s,
                          stripe_express_account_kind = 'direct_fee'
                   where id = %s and stripe_express_account_id is null
                   returning stripe_express_account_id""",
                (new_id, business_type, organization["id"]),
            )
            stored = cur.fetchone()
        if stored is None:
            org = _payment_org(organization["id"])
            account_id, kind = org.get("stripe_express_account_id"), express_kind(org)
            if not account_id:
                raise HTTPException(409, "Bitte die Seite neu laden")
        else:
            account_id, kind, created = new_id, DIRECT_FEE, True
            # Nothing is enabled before onboarding; "Status prüfen" and
            # account.updated bring the real state.
            store_express_status(account_id, {})
    base = f"{settings.frontend_base_url}/pilot/{organization_slug}/konfiguration"
    refresh_url, return_url = f"{base}?stripe=refresh#zahlungen", f"{base}?stripe=return#zahlungen"
    try:
        if kind == DIRECT_FEE:
            link = _stripe_dict(_stripe_v2().v2.core.account_links.create({
                "account": account_id,
                "use_case": {
                    "type": "account_onboarding",
                    "account_onboarding": {"refresh_url": refresh_url, "return_url": return_url},
                },
            }))
        else:  # B2 Express account (destination, staging only)
            link = _stripe_dict(client.AccountLink.create(
                account=account_id, refresh_url=refresh_url, return_url=return_url, type="account_onboarding",
            ))
    except stripe.error.StripeError as error:
        raise _stripe_setup_error(error, "account link creation", organization_slug) from None
    url = link.get("url")
    if not isinstance(url, str) or not url.startswith(ONBOARDING_URL_PREFIXES):
        raise HTTPException(503, "Zahlungsanbieter hat keinen Link geliefert")
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="stripe.express_onboarding_started",
        organization_id=str(organization["id"]), target_type="organization", target_id=organization_slug,
        metadata={"account_created": created, "account_kind": kind},
    )
    return OnboardingLink(url=url)


@router.post("/admin/organizations/{organization_slug}/payments/stripe/sync", response_model=ExpressStatus)
def sync_express_status(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> ExpressStatus:
    """"Status prüfen": read the club account from Stripe now. v1 retrieve
    works for Accounts v2 too and returns the v1 shape (charges_enabled,
    payouts_enabled, details_submitted, requirements), the same shape as the
    account.updated webhook."""
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
        except stripe.error.StripeError as error:
            raise _stripe_setup_error(error, "account status sync", organization_slug) from None
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


REFUND_FAILED_STATUSES = ("failed", "canceled")

_REFUND_ERRORS = {
    "charge_already_refunded": (409, "Diese Zahlung ist bereits vollständig erstattet."),
    "insufficient_funds": (409, "Das Stripe-Guthaben des Vereins reicht für die Rückbuchung gerade nicht aus."),
    "balance_insufficient": (409, "Das Stripe-Guthaben des Vereins reicht für die Rückbuchung gerade nicht aus."),
    "charge_disputed": (409, "Die Zahlung wird gerade angefochten und kann nicht erstattet werden."),
    "amount_too_large": (422, "Betrag höher als der noch erstattbare Rest."),
}


def is_fee_mode_payment(row: dict) -> bool:
    """True when the booking was paid through CampsPilot's Stripe checkout with
    platform fee (direct_fee, destination or platform), so CampsPilot can refund it."""
    kind = row.get("stripe_charge_type")
    account = row.get("stripe_checkout_account_id")
    if kind not in FEE_MODES + (PLATFORM,) or not row.get("stripe_payment_intent_id"):
        return False
    return not (kind == DIRECT_FEE and not (isinstance(account, str) and ACCOUNT_ID.fullmatch(account)))


def create_online_refund(organization_id, organization_slug: str, row: dict, amount: int, key_suffix: str) -> dict:
    """Creates the Stripe refund (platform fee refunded too). Shared by the
    admin refund and the parent's self-cancel. The idempotency key makes a
    repeated call with the same suffix one refund. Raises HTTPException (the
    admin endpoint passes it on; the parent flow maps every failure to 502).
    Status and amounts are booked by the webhook."""
    kind = row["stripe_charge_type"]
    settings = get_settings()
    if not (_express_ready(settings) if kind in PLATFORM_ACCOUNT_MODES else _service_ready(settings)):
        raise HTTPException(503, "Online-Zahlung ist in dieser Umgebung noch nicht eingerichtet")
    client = _stripe_client()
    params = dict(
        payment_intent=row["stripe_payment_intent_id"],
        amount=amount,
        metadata={**CAMPSPILOT_MARKER, "organization_id": str(organization_id)},
        idempotency_key=f"campspilot-refund-{row['id']}-{amount}-{key_suffix}",
    )
    if kind == PLATFORM:
        # Platform charge: refunded on the platform account itself. No
        # application fee exists, no transfer to reverse; the platform fee is
        # given back in full (proportionally) when the webhook books it.
        pass
    elif kind == DESTINATION:
        params.update(refund_application_fee=True, reverse_transfer=True)
    else:
        params["refund_application_fee"] = True
        # Direct charge: the PaymentIntent lives on the club's account.
        params["stripe_account"] = row["stripe_checkout_account_id"]
    try:
        refund = _stripe_dict(client.Refund.create(**params))
    except stripe.error.InvalidRequestError as error:
        status_code, message = _REFUND_ERRORS.get(
            getattr(error, "code", None) or "", (502, "Stripe hat die Erstattung abgelehnt. Bitte prüfe sie im Stripe-Dashboard."))
        logger.warning("Refund rejected by Stripe (organization_slug=%s, code=%s)", organization_slug, getattr(error, "code", None))
        raise HTTPException(status_code, message) from None
    except stripe.error.StripeError:
        raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None
    if refund.get("status") in REFUND_FAILED_STATUSES:
        # Stripe answered, but the money is not going back.
        logger.warning("Refund not accepted by Stripe (organization_slug=%s, status=%s)", organization_slug, refund.get("status"))
        raise HTTPException(502, "Stripe hat die Erstattung abgelehnt. Bitte prüfe sie im Stripe-Dashboard.")
    return refund


def existing_refund_cents(row: dict) -> int:
    """Sum of refunds Stripe already holds for this booking's payment (pending or succeeded).
    Used to resume a parent's cancel after a crash without refunding twice. Raises on any
    Stripe problem; the caller then falls back to the idempotent create."""
    client = _stripe_client()
    params = dict(payment_intent=row["stripe_payment_intent_id"], limit=20)
    if row["stripe_charge_type"] not in PLATFORM_ACCOUNT_MODES:
        params["stripe_account"] = row["stripe_checkout_account_id"]
    listed = _stripe_dict(client.Refund.list(**params))
    return sum(r.get("amount") or 0 for r in listed.get("data", [])
               if isinstance(r, dict) and r.get("status") not in REFUND_FAILED_STATUSES)


@router.post("/admin/organizations/{organization_slug}/registrations/{registration_token}/refund", response_model=RefundResult)
def refund_destination_payment(
    organization_slug: str,
    registration_token: UUID,
    body: RefundRequest,
    auth: AuthContext = Depends(require_org_access),
) -> RefundResult:
    """Refund an online payment with platform fee. direct_fee: refund on the
    club's account, the platform fee is returned proportionally. destination
    (B2): the transfer to the club is reversed as well. Status and refunded
    amounts are booked by the webhook (charge.refunded) from Stripe's own
    numbers."""
    organization = require_organization(organization_slug)
    with db.get_cursor() as cur:
        cur.execute(
            """select id, payment_status, stripe_payment_intent_id, stripe_charge_type,
                      stripe_checkout_amount_cents, refunded_cents, stripe_checkout_account_id
               from camp_registrations
               where organization_id = %s and registration_token = %s""",
            (organization["id"], registration_token),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "Registration not found")
    if not is_fee_mode_payment(row):
        raise HTTPException(409, "Diese Zahlung lief nicht über CampsPilot. Bitte im eigenen Stripe-Konto erstatten.")
    if row["payment_status"] not in ("paid", "partially_refunded"):
        raise HTTPException(409, "Nur bezahlte Online-Zahlungen können erstattet werden")
    remaining = (row["stripe_checkout_amount_cents"] or 0) - (row["refunded_cents"] or 0)
    amount = body.amount_cents if body.amount_cents is not None else remaining
    if amount <= 0 or amount > remaining:
        raise HTTPException(422, "Betrag höher als der noch erstattbare Rest")
    refund = create_online_refund(organization["id"], organization_slug, row, amount, str(body.request_id))
    refunded = refund.get("amount") if isinstance(refund.get("amount"), int) else amount
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="stripe.refund_requested",
        organization_id=str(organization["id"]), target_type="registration", target_id=str(row["id"]),
        metadata={"amount_cents": refunded, "full": refunded >= remaining},
    )
    return RefundResult(status=str(refund.get("status") or "pending"), amount_cents=refunded)


def _session_scope(row: dict) -> dict:
    """Destination sessions live on the platform account (no stripe_account
    header); direct_fee and legacy direct sessions on the club's account."""
    if row.get("stripe_charge_type") in PLATFORM_ACCOUNT_MODES:
        return {}
    return {"stripe_account": row["stripe_checkout_account_id"]}


def _expire_session(session_id: str, scope: dict) -> None:
    client = _stripe_client()
    session = _stripe_dict(client.checkout.Session.retrieve(session_id, **scope))
    if session.get("status") == "open":
        client.checkout.Session.expire(session_id, **scope)


class CheckoutPaidError(Exception):
    """Stripe reports the checkout of this registration as completed or paid."""


class CheckoutUnavailableError(Exception):
    """Stripe could not be asked or did not confirm the session is closed."""


def close_checkout_before_delete(organization_id, camp_id, registration_token) -> None:
    """Runs BEFORE a registration is deleted: an open Stripe Checkout must be
    expired synchronously, otherwise a parent could pay a booking that no
    longer exists. Complete or paid -> CheckoutPaidError (the admin must refund
    or cancel instead). Any Stripe failure -> CheckoutUnavailableError, and the
    caller must not delete. No Stripe configuration or no checkout -> no-op."""
    settings = get_settings()
    if not (settings.stripe_checkout_enabled and settings.stripe_secret_key and settings.stripe_webhook_secret):
        return
    with db.get_cursor() as cur:
        cur.execute(
            """select stripe_checkout_session_id, stripe_checkout_account_id, payment_status,
                      stripe_charge_type
               from camp_registrations
               where organization_id = %s and camp_id = %s and registration_token = %s""",
            (organization_id, camp_id, registration_token),
        )
        row = cur.fetchone()
    # Only a still-open booking can have a payment in flight. A refunded
    # checkout stays "complete/paid" in Stripe forever, and paid-online is
    # already refused by the database guard; cash, transfer and waived have no checkout to close.
    if not row or row["payment_status"] != "open":
        return
    if not row["stripe_checkout_session_id"]:
        return  # no online payment started
    if row.get("stripe_charge_type") not in PLATFORM_ACCOUNT_MODES and not row["stripe_checkout_account_id"]:
        return  # legacy direct rows without a connected account (pre v11) cannot be asked
    session_id, scope = row["stripe_checkout_session_id"], _session_scope(row)
    try:
        client = _stripe_client()
        # Destination (Express): platform account, no stripe_account header.
        # Direct charges (direct_fee, legacy): the club's account.
        session = _stripe_dict(client.checkout.Session.retrieve(session_id, **scope))
        if session.get("status") == "complete" or session.get("payment_status") == "paid":
            raise CheckoutPaidError()
        if session.get("status") == "open":
            client.checkout.Session.expire(session_id, **scope)
    except CheckoutPaidError:
        raise
    except Exception as exc:  # noqa: BLE001 - any Stripe/network failure blocks the delete
        logger.warning("Could not close Stripe checkout before delete (error_type=%s)", type(exc).__name__)
        raise CheckoutUnavailableError() from exc


# ---------------------------------------------------------------------------
# Payout ledger (platform payments): what the platform owes the club per month
# ---------------------------------------------------------------------------

MONTH_PATTERN = r"^20[0-9]{2}-(0[1-9]|1[0-2])$"


class PayoutBooking(BaseModel):
    """One platform payment. No child or parent data."""

    date: _dt.date
    camp_title: str
    amount_cents: int
    fee_cents: int
    refund_cents: int


class PayoutRecord(BaseModel):
    payout_cents: int
    paid_at: date
    reference: str


class PayoutMonth(BaseModel):
    """Payments that ran over the platform account, by the Berlin month they
    were paid in. payout = paid - refunded - platform fee (net of its refund).
    Refunds are counted in full against the booking's payment month."""

    month: str
    paid_cents: int
    refunded_cents: int
    fee_cents: int
    payout_cents: int
    iban: Optional[str] = None
    bookings: list[PayoutBooking]
    payout: Optional[PayoutRecord] = None
    # A refund arrived after the payout was marked as transferred.
    changed_since_paid: bool = False


class PayoutMarkPaid(BaseModel):
    model_config = ConfigDict(extra="forbid")
    paid_at: date
    reference: str = Field(min_length=1, max_length=140)


def _payout_month(organization, month: str) -> PayoutMonth:
    with db.get_cursor() as cur:
        cur.execute(
            """select (r.paid_at at time zone 'Europe/Berlin')::date as day, c.title as camp_title,
                      r.stripe_checkout_amount_cents as amount_cents,
                      r.fee_cents - coalesce(r.fee_refunded_cents, 0) as fee_cents,
                      coalesce(r.refunded_cents, 0) as refund_cents
               from camp_registrations r
               join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
               where r.organization_id = %s and r.stripe_charge_type = 'platform'
                 and r.payment_status in ('paid', 'partially_refunded', 'refunded')
                 and r.fee_snapshot_at is not null
                 and to_char(r.paid_at at time zone 'Europe/Berlin', 'YYYY-MM') = %s
               order by r.paid_at, r.id""",
            (organization["id"], month),
        )
        rows = cur.fetchall()
        cur.execute("select iban from organizations where id = %s", (organization["id"],))
        org = cur.fetchone() or {}
        cur.execute(
            "select payout_cents, paid_at, reference from organization_payouts "
            "where organization_id = %s and month = %s",
            (organization["id"], f"{month}-01"),
        )
        record = cur.fetchone()
    bookings = [PayoutBooking(date=r["day"], camp_title=r["camp_title"], amount_cents=int(r["amount_cents"] or 0),
                              fee_cents=int(r["fee_cents"] or 0), refund_cents=int(r["refund_cents"])) for r in rows]
    paid = sum(b.amount_cents for b in bookings)
    refunded = sum(b.refund_cents for b in bookings)
    fee = sum(b.fee_cents for b in bookings)
    payout = paid - refunded - fee
    return PayoutMonth(
        month=month, paid_cents=paid, refunded_cents=refunded, fee_cents=fee, payout_cents=payout,
        iban=org.get("iban"), bookings=bookings,
        payout=PayoutRecord(**record) if record else None,
        changed_since_paid=bool(record and record["payout_cents"] != payout),
    )


@router.get("/admin/platform/organizations/{organization_slug}/payouts", response_model=PayoutMonth)
def get_payouts(
    organization_slug: str,
    month: str = Query(pattern=MONTH_PATTERN),
    auth: AuthContext = Depends(require_platform_owner),
) -> PayoutMonth:
    """Owner-only payout list for one club and month."""
    del auth
    return _payout_month(require_organization(organization_slug), month)


@router.post("/admin/platform/organizations/{organization_slug}/payouts/{month}/mark-paid", response_model=PayoutMonth)
def mark_payout_paid(
    organization_slug: str,
    body: PayoutMarkPaid,
    month: str = Path(pattern=MONTH_PATTERN),
    auth: AuthContext = Depends(require_platform_owner),
) -> PayoutMonth:
    """Record that the month's payout was transferred to the club. Repeating
    the same call is harmless; a different date or reference for an already
    marked month is refused (one payout per club and month)."""
    organization = require_organization(organization_slug)
    current = _payout_month(organization, month)
    if current.payout is not None:
        if current.payout.paid_at == body.paid_at and current.payout.reference == body.reference:
            return current
        raise HTTPException(409, "Dieser Monat ist bereits als überwiesen markiert")
    if current.payout_cents <= 0:
        raise HTTPException(409, "Für diesen Monat gibt es nichts zu überweisen")
    with db.get_cursor() as cur:
        cur.execute(
            """insert into organization_payouts (organization_id, month, payout_cents, paid_at, reference)
               values (%s, %s, %s, %s, %s)
               on conflict (organization_id, month) do nothing returning id""",
            (organization["id"], f"{month}-01", current.payout_cents, body.paid_at, body.reference),
        )
        created = cur.fetchone() is not None
    if not created:  # lost a race with an identical or different call
        again = _payout_month(organization, month)
        if again.payout and again.payout.paid_at == body.paid_at and again.payout.reference == body.reference:
            return again
        raise HTTPException(409, "Dieser Monat ist bereits als überwiesen markiert")
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="payout.marked_paid",
        organization_id=str(organization["id"]), target_type="organization", target_id=organization_slug,
        metadata={"month": month, "payout_cents": current.payout_cents},
    )
    return _payout_month(organization, month)
