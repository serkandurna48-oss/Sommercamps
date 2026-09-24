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

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_tenant_context
from ..repositories import registrations as registrations_repo
from ..repositories.registrations import (
    CampNotAvailableError,
    ChildAgeNotEligibleError,
    DuplicateRegistrationError,
    RegistrationWindowClosedError,
)
from ..schemas import RegistrationCreate, RegistrationCreated
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/organizations/{organization_slug}/camps/{camp_slug}/registrations",
    tags=["Registrations"],
)


@router.post("", response_model=RegistrationCreated, status_code=status.HTTP_201_CREATED)
def create_registration(
    camp_slug: str,
    data: RegistrationCreate,
    tenant: TenantContext = Depends(get_tenant_context),
) -> RegistrationCreated:
    """
    organization_slug -> get_tenant_context -> TenantContext (organization
    existence/active check already done by the dependency). camp_slug is
    then resolved server-side too, via get_registration_target — `data`
    carries no organization_id/camp_id field at all (see RegistrationCreate),
    so neither ID this write depends on ever originates from the client.
    """
    camp = registrations_repo.get_registration_target(tenant, camp_slug)
    if camp is None:
        # Unknown slug, draft/closed/archived, or a different tenant's camp
        # — all indistinguishable by design, same as the public read API.
        raise HTTPException(status_code=404, detail="Camp not found")

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
        row = registrations_repo.create_registration(tenant, camp, data)
    except DuplicateRegistrationError as exc:
        logger.info(
            "Registration rejected: duplicate child (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Für dieses Kind liegt für dieses Camp bereits eine Anmeldung vor.",
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
    except Exception:
        # Never leak a raw psycopg2/PostgreSQL exception (which could
        # include constraint/column names) to the client.
        logger.exception(
            "Registration failed with an unexpected error (organization_slug=%s, camp_slug=%s)",
            tenant.slug,
            camp_slug,
        )
        raise HTTPException(status_code=500, detail="Registration could not be processed") from None

    logger.info(
        "Registration created (organization_slug=%s, camp_slug=%s, status=%s)",
        tenant.slug,
        camp_slug,
        row["status"],
    )
    return RegistrationCreated.model_validate(row)
