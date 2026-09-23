"""
FastAPI-specific dependency layer. Deliberately tiny: the one function
below is the only place a client-supplied `organization_slug` is allowed to
touch tenant resolution — every route depends on it instead of calling
tenancy.resolve_tenant() directly. See README.md "Tenant isolation".
"""

from __future__ import annotations

import logging

from fastapi import HTTPException

from .tenancy import (
    TenantContext,
    TenantInactiveError,
    TenantNotFoundError,
    TenantUnpublishedError,
    resolve_tenant,
)

logger = logging.getLogger(__name__)


def get_tenant_context(organization_slug: str) -> TenantContext:
    """
    Resolves the `organization_slug` path parameter to a TenantContext.

    Unknown, inactive (suspended/cancelled), AND unpublished (operator
    draft) organizations all surface as the same plain 404 to the client —
    deliberately not distinguished, so the public API never confirms that a
    slug belongs to a real (just currently inactive/draft) tenant. See the
    CP-S404 report's "offene Entscheidungen" for the original reasoning
    (extended here to the same-shaped site_published case). The
    distinction is still logged server-side for operational visibility.
    """
    try:
        return resolve_tenant(organization_slug)
    except TenantInactiveError as exc:
        logger.info(
            "Rejected request for inactive organization (slug=%s, plan_status=%s)",
            exc.slug,
            exc.plan_status,
        )
        raise HTTPException(status_code=404, detail="Organization not found") from exc
    except TenantUnpublishedError as exc:
        logger.info("Rejected request for unpublished organization (slug=%s)", exc.slug)
        raise HTTPException(status_code=404, detail="Organization not found") from exc
    except TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Organization not found") from exc
