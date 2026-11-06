"""
Public, write-only Camp Registration endpoint.

The first endpoint in this service that writes real personal data about a
child. See README.md "PII and logging" — this module (and everything it
calls) must never log the request body, a name, an email address, a phone
number, or medical_notes/allergies. Only slugs, event types, and technical
exception classes are safe to log.

Since CP-S406: a full camp no longer rejects the request with 409 — the
registration is created with status='waitlist' instead, still HTTP 201.
See app/registration_lifecycle.py and
app/repositories/registrations.py::create_registration.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from ..deps import get_tenant_context
from ..ratelimit import registration_limiter, trusted_client_ip
from ..notifications.sending import send_registration_notification
from ..repositories import registrations as registrations_repo
from ..repositories.registrations import (
    BillingAddressRequiredError,
    CampNotAvailableError,
    ChildAgeNotEligibleError,
    DuplicateRegistrationError,
    ExtraAnswersInvalidError,
    OrganizationNotAvailableError,
    RegistrationWindowClosedError,
    TrainingOnlinePaymentNotPossibleError,
    TrainingSessionFullError,
    TrainingSessionPastError,
)
from .payments import online_payment_available
from ..schemas import RegistrationCreate, RegistrationCreated
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)

# 'online' is additionally accepted only while the club's Stripe account is active.
TRAINING_PAYMENT_METHODS = ("ueberweisung", "bar", "online")
_TRAINING_PAST_MSG = "Dieser Trainingstermin liegt in der Vergangenheit und kann nicht mehr gebucht werden."
_TRAINING_FULL_MSG = "Dieser Trainingstermin ist leider bereits belegt."
_DUPLICATE_MSG = "Für dieses Kind liegt für dieses Camp bereits eine Anmeldung vor."
BILLING_ADDRESS_REQUIRED_MSG = "Bitte geben Sie Ihre Rechnungsanschrift an."


def _training_conflict(code: str, message: str) -> dict[str, str]:
    """Stable 409 contract for trainings: the frontend reads `detail.code`, never the text."""
    return {"code": code, "message": message}


router = APIRouter(
    prefix="/api/v1/organizations/{organization_slug}/camps/{camp_slug}/registrations",
    tags=["Registrations"],
)


# exclude_none: classic camps keep the exact pre-training response (no applied_price_cents key).
@router.post("", response_model=RegistrationCreated, response_model_exclude_none=True,
             status_code=status.HTTP_201_CREATED)
def create_registration(
    camp_slug: str,
    data: RegistrationCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
) -> RegistrationCreated:
    """
    organization_slug -> get_tenant_context -> TenantContext (organization
    existence/active check already done by the dependency). camp_slug is
    then resolved server-side too, via get_registration_target — `data`
    carries no organization_id/camp_id field at all (see RegistrationCreate),
    so neither ID this write depends on ever originates from the client.
    """
    client_ip = trusted_client_ip(request)
    if client_ip is not None and not registration_limiter.allow(client_ip):
        logger.info("Registration rejected: rate limit (organization_slug=%s)", tenant.slug)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Zu viele Anmeldungen von diesem Anschluss. Bitte versuchen Sie es später erneut.",
        )

    camp = registrations_repo.get_registration_target(tenant, camp_slug)
    if camp is None:
        # Unknown slug, draft/closed/archived, or a different tenant's camp
        # — all indistinguishable by design, same as the public read API.
        raise HTTPException(status_code=404, detail="Camp not found")

    is_training = camp.offer_id is not None
    if is_training and "trainings" not in tenant.modules:
        # Trainings module off: a session slug looks like any unknown camp.
        raise HTTPException(status_code=404, detail="Camp not found")
    if is_training:
        # Bookable check order: unknown/draft/archived -> 404 (above), already
        # started -> 409, bad payment method -> 422, then window/age -> 422.
        if camp.starts_at is not None and camp.starts_at <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_training_conflict("training_session_past", _TRAINING_PAST_MSG),
            )
        if data.payment_method not in TRAINING_PAYMENT_METHODS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Zahlungsart muss 'ueberweisung', 'bar' oder 'online' sein.",
            )
        if data.payment_method == "online" and not online_payment_available(tenant.organization_id):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Online-Zahlung ist für diesen Verein derzeit nicht verfügbar.",
            )

    try:
        registrations_repo.validate_registration_window(camp)
        registrations_repo.validate_child_age(camp, data.child_birth_date)
    except RegistrationWindowClosedError as exc:
        logger.info(
            "Registration rejected: window closed (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Registration is not currently open for this camp",
        ) from exc
    except ChildAgeNotEligibleError as exc:
        logger.info(
            "Registration rejected: age not eligible (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Child's age does not meet this camp's age requirements",
        ) from exc

    try:
        if is_training:
            row = registrations_repo.create_training_registration(tenant, camp, data)
        else:
            row = registrations_repo.create_registration(tenant, camp, data)
    except TrainingSessionFullError as exc:
        logger.info(
            "Registration rejected: training full (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_training_conflict("training_session_full", _TRAINING_FULL_MSG),
        ) from exc
    except TrainingSessionPastError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_training_conflict("training_session_past", _TRAINING_PAST_MSG),
        ) from exc
    except TrainingOnlinePaymentNotPossibleError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Für kostenlose Buchungen ist keine Online-Zahlung nötig. Bitte 'bar' oder 'ueberweisung' wählen.",
        ) from exc
    except BillingAddressRequiredError as exc:
        logger.info(
            "Registration rejected: billing address missing (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=BILLING_ADDRESS_REQUIRED_MSG,
        ) from exc
    except ExtraAnswersInvalidError as exc:
        logger.info(
            "Registration rejected: extra_answers invalid (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except OrganizationNotAvailableError as exc:
        raise HTTPException(status_code=404, detail="Organization not found") from exc
    except DuplicateRegistrationError as exc:
        logger.info(
            "Registration rejected: duplicate child (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                _training_conflict("registration_duplicate", _DUPLICATE_MSG)
                if is_training else _DUPLICATE_MSG
            ),
        ) from exc
    except CampNotAvailableError as exc:
        # Real, reachable path (Bug, korrigiert im Security-Review vor
        # Kundeneinladung — der vorherige Kommentar hier behauptete fälsch-
        # lich "practically unreachable"): ein Admin, der das Camp exakt
        # zwischen dem initialen get_registration_target()-Lookup oben und
        # create_registration()'s gesperrtem Re-Check zurückzieht
        # (status='draft'), löst genau diesen Pfad aus — siehe
        # create_registration's Docstring/Re-Check in
        # repositories/registrations.py.
        logger.warning(
            "Registration rejected: camp no longer available mid-transaction "
            "(organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(status_code=404, detail="Camp not found") from exc
    except Exception as exc:
        # Never leak a raw psycopg2/PostgreSQL exception (which could
        # include constraint/column names) to the client.
        logger.error(
            "Registration failed with an unexpected error (organization_slug=%s, camp_slug=%s, error_type=%s)",
            tenant.slug,
            camp_slug,
            type(exc).__name__,
        )
        raise HTTPException(status_code=500, detail="Registration could not be processed") from None

    logger.info(
        "Registration created (organization_slug=%s, camp_slug=%s, status=%s)",
        tenant.slug,
        camp_slug,
        row["status"],
    )
    training_mail_kwargs = (
        {
            "applied_price_cents": row.get("applied_price_cents"),
            "starts_at": camp.starts_at,
            "payment_method": data.payment_method,
        }
        if is_training
        else {}
    )
    background_tasks.add_task(
        send_registration_notification,
        registration_token=row["registration_token"],
        status=row["status"],
        organization_id=tenant.organization_id,
        camp_id=camp.id,
        start_date=camp.start_date,
        end_date=camp.end_date,
        parent_email=data.parent_email,
        parent_first_name=data.parent_first_name,
        parent_last_name=data.parent_last_name,
        child_first_name=data.child_first_name,
        child_last_name=data.child_last_name,
        **training_mail_kwargs,
    )
    return RegistrationCreated.model_validate({**row, "camp_title": camp.title})
