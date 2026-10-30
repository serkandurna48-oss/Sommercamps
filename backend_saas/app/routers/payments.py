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
import secrets
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .. import db
from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_platform_owner
from ..config import get_settings
from ..deps import get_tenant_context
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Payments"])
ACCOUNT_ID = re.compile(r"^acct_[A-Za-z0-9]{8,}$")
CHECKOUT_ID = re.compile(r"^cs_(test_|live_)[A-Za-z0-9]+$")
PAYMENT_INTENT_ID = re.compile(r"^pi_[A-Za-z0-9]+$")


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


def _stripe_client():
    settings = get_settings()
    key = settings.stripe_secret_key
    if not settings.stripe_checkout_enabled or not key:
        raise HTTPException(503, "Online-Zahlung noch nicht eingerichtet")
    # Never accidentally use a live Stripe key against a staging database.
    production = settings.app_env.strip().lower() == "production"
    if (production and not key.startswith("sk_live_")) or (
        not production and not key.startswith("sk_test_")
    ):
        raise HTTPException(503, "Stripe-Schlüssel passt nicht zur Umgebung")
    stripe.api_key = key
    return stripe


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
    if not settings.stripe_checkout_enabled or not settings.stripe_secret_key:
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
        account = client.Account.retrieve(body.stripe_account_id)
    except stripe.error.StripeError:
        raise HTTPException(422, "Stripe-Konto nicht verbunden oder nicht abrufbar") from None

    enabled = bool(account.get("charges_enabled"))
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
) -> CheckoutURL:
    client = _stripe_client()
    settings = get_settings()
    # Lock the registration through Stripe's create/retrieve call to avoid two
    # concurrent checkout URLs with competing payments for the same booking.
    with db.get_cursor() as cur:
        cur.execute(
            """select r.id, r.status, r.payment_status, r.stripe_checkout_session_id,
                      o.stripe_account_id, o.stripe_charges_enabled, o.online_payment_enabled,
                      c.title, c.price_cents, c.currency, c.status as camp_status
               from camp_registrations r
               join organizations o on o.id = r.organization_id
               join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
               where r.registration_token = %s and r.organization_id = %s
                     and c.slug = %s
               for update of r""",
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
                session = client.checkout.Session.retrieve(existing, stripe_account=account)
                if session.get("status") == "open" and session.get("url"):
                    return CheckoutURL(url=session["url"])
                if session.get("payment_status") == "paid":
                    raise HTTPException(409, "Zahlung wird bereits verarbeitet")
            except stripe.error.StripeError:
                logger.warning("Could not retrieve previous checkout session (organization_slug=%s)", tenant.slug)
                raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None

        # Only public camp title is sent; never send child/parent info or medical data.
        success = f"{settings.frontend_base_url}/pilot/{tenant.slug}/zahlung?result=success"
        cancel = f"{settings.frontend_base_url}/pilot/{tenant.slug}/zahlung?result=cancel"
        try:
            session = client.checkout.Session.create(
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
                metadata={"organization_id": str(tenant.organization_id), "camp_slug": camp_slug},
                stripe_account=account,
                idempotency_key=f"campspilot-{registration_token}-{secrets.token_hex(12)}",
            )
        except stripe.error.StripeError:
            logger.warning("Checkout creation failed (organization_slug=%s)", tenant.slug)
            raise HTTPException(503, "Zahlungsanbieter derzeit nicht erreichbar") from None

        if not session.get("id") or not session.get("url"):
            raise HTTPException(503, "Zahlungsanbieter hat keine Zahlungsseite geliefert")
        cur.execute(
            """update camp_registrations
               set stripe_checkout_session_id = %s, stripe_checkout_amount_cents = %s,
                   stripe_checkout_currency = %s, stripe_checkout_account_id = %s
               where id = %s and organization_id = %s""",
            (session["id"], amount, currency, account, booking["id"], tenant.organization_id),
        )
    return CheckoutURL(url=session["url"])


@router.post("/api/v1/payments/stripe/webhook")
async def stripe_connect_webhook(
    request: Request,
    stripe_signature: str | None = Header(None),
):
    settings = get_settings()
    if not settings.stripe_checkout_enabled or not settings.stripe_webhook_secret:
        raise HTTPException(503, "Stripe-Webhooks nicht konfiguriert")
    client = _stripe_client()
    try:
        event = client.Webhook.construct_event(
            await request.body(), stripe_signature or "", settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(400, "Ungültige Stripe-Signatur") from None

    expected_live = settings.app_env.strip().lower() == "production"
    if event.get("livemode") is not expected_live:
        raise HTTPException(400, "Falscher Stripe-Modus")
    account = event.get("account")
    if not account or not ACCOUNT_ID.fullmatch(account):
        # Direct charges must originate on a connected account.
        raise HTTPException(400, "Stripe-Konto fehlt")

    event_type = event["type"]
    obj = event["data"]["object"]
    if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if obj.get("payment_status") != "paid":
            return {"received": True, "settled": False}
        session_id = obj.get("id")
        paid_amount = obj.get("amount_total")
        paid_currency = (obj.get("currency") or "").lower()
        payment_intent = obj.get("payment_intent")
        if not isinstance(session_id, str) or not isinstance(paid_amount, int):
            raise HTTPException(400, "Stripe-Zahlungsdaten unvollständig")
        if payment_intent is not None and (
            not isinstance(payment_intent, str) or not PAYMENT_INTENT_ID.fullmatch(payment_intent)
        ):
            raise HTTPException(400, "Ungültiger Stripe-PaymentIntent")
        with db.get_cursor() as cur:
            cur.execute(
                """select r.id, r.payment_status, r.status, r.stripe_checkout_amount_cents,
                          r.stripe_checkout_currency
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
                # Retry in case the webhook beat the checkout DB commit.
                raise HTTPException(503, "Stripe-Zahlung noch nicht zuordenbar")
            if row["stripe_checkout_amount_cents"] != paid_amount or row["stripe_checkout_currency"] != paid_currency:
                logger.error("Stripe amount/currency mismatch; payment not marked paid")
                raise HTTPException(409, "Zahlungsbetrag stimmt nicht überein")
            if row["payment_status"] == "paid":
                return {"received": True, "settled": True}
            if row["status"] not in ("registered", "confirmed") or row["payment_status"] != "open":
                # Never restore cancelled/waived/refunded registrations.
                logger.warning("Stripe payment for non-payable registration; manual refund review needed")
                return {"received": True, "settled": False}
            cur.execute(
                """update camp_registrations set payment_status = 'paid',
                       stripe_payment_intent_id = %s, paid_at = now()
                   where id = %s and payment_status = 'open'""",
                (payment_intent, row["id"]),
            )
        return {"received": True, "settled": True}

    if event_type == "charge.refunded":
        intent = obj.get("payment_intent")
        # Do not mark partially refunded payments as fully refunded.
        if (
            isinstance(intent, str) and PAYMENT_INTENT_ID.fullmatch(intent)
            and obj.get("refunded") is True
            and obj.get("amount_refunded") == obj.get("amount")
        ):
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
    return {"received": True}
