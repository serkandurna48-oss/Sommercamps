"""Fixes from the review of 10.11.2026: access-log token masking, blank
RETENTION_APPLY, no reminder after a cancellation request."""

import logging

import pytest

from app import reminders
from app.config import Settings
from app.log_redact import MaskUUIDFilter, install_access_log_filter, mask_uuids

TOKEN = "3f2b9c1e-8d4a-4b6e-9f00-1234567890ab"


def test_mask_uuids_replaces_every_uuid():
    path = f"/api/v1/organizations/ksv/registrations/{TOKEN}/cancellation-request?x={TOKEN.upper()}"
    masked = mask_uuids(path)
    assert TOKEN not in masked and TOKEN.upper() not in masked
    assert masked == "/api/v1/organizations/ksv/registrations/<id>/cancellation-request?x=<id>"


def test_filter_masks_uvicorn_access_args():
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:1", "GET", f"/api/v1/organizations/ksv/registrations/{TOKEN}", "1.1", 200),
        None,
    )
    assert MaskUUIDFilter().filter(record) is True
    assert TOKEN not in record.getMessage()
    assert "/registrations/<id>" in record.getMessage()


def test_filter_is_installed_once_on_app_import():
    import app.main  # noqa: F401  installs the filter

    install_access_log_filter()
    filters = [f for f in logging.getLogger("uvicorn.access").filters if isinstance(f, MaskUUIDFilter)]
    assert len(filters) == 1


@pytest.mark.parametrize("raw,expected", [("", False), ("  ", False), ("false", False), ("true", True)])
def test_retention_apply_blank_means_false(monkeypatch, raw, expected):
    monkeypatch.setenv("RETENTION_APPLY", raw)
    assert Settings().retention_apply is expected


def test_reminder_queries_skip_cancellation_requests():
    assert "cancellation_requested_at is null" in reminders._DUE
    assert "cancellation_requested_at is null" in reminders._CLAIM
