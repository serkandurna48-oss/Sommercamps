"""Internal endpoints for scheduled jobs (not part of the public API).

POST /internal/cron/daily runs the daily jobs once: health-data retention, the
12-month review count and the reminder mails three days before camp start.
Called by .github/workflows/daily-jobs.yml with `Authorization: Bearer <CRON_SECRET>`.

The response contains counts only: no IDs, names, addresses or error texts.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from .. import reminders, retention
from ..config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["Internal"], include_in_schema=False)


def _authorize(authorization: str | None) -> None:
    secret = (get_settings().cron_secret or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Daily jobs are not configured")
    scheme, _, token = (authorization or "").partition(" ")
    # Compare bytes: compare_digest raises TypeError for non-ASCII str.
    supplied = token.strip().encode("utf-8") if scheme == "Bearer" else b""
    if not hmac.compare_digest(supplied, secret.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/cron/daily")
def run_daily(authorization: str | None = Header(default=None)) -> JSONResponse:
    _authorize(authorization)
    settings = get_settings()
    today = retention.berlin_today()
    result: dict = {}
    failed: list[str] = []

    try:
        health = retention.health_data_retention(apply=bool(settings.retention_apply), today=today)
        result["health_data_rows"] = health["rows"]
        result["health_data_applied"] = health["applied"]
    except Exception as exc:  # noqa: BLE001 - the other jobs must still run
        logger.error("Daily job health_data failed (error_type=%s)", type(exc).__name__)
        failed.append("health_data")
        result.update(health_data_rows=0, health_data_applied=False)

    try:
        result["general_review_rows"] = retention.general_review_rows(today)
    except Exception as exc:  # noqa: BLE001
        logger.error("Daily job general_review failed (error_type=%s)", type(exc).__name__)
        failed.append("general_review")
        result["general_review_rows"] = 0

    try:
        sent = reminders.send_due_reminders(today)
        result.update(reminders_due=sent["due"], reminders_sent=sent["sent"], reminders_failed=sent["failed"])
    except Exception as exc:  # noqa: BLE001
        logger.error("Daily job reminders failed (error_type=%s)", type(exc).__name__)
        failed.append("reminders")
        result.update(reminders_due=0, reminders_sent=0, reminders_failed=0)

    if failed:
        return JSONResponse(status_code=500, content={**result, "failed_jobs": failed})
    return JSONResponse(status_code=200, content=result)
