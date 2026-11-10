"""Masks UUIDs in uvicorn access-log lines.

Registration tokens are UUIDs in public paths (e.g. "Meine Buchung" links that
are sent by mail and stay valid). Anyone with log access could open those
bookings, so the access log only ever shows "<id>" instead of the value.
"""

from __future__ import annotations

import logging
import re

UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def mask_uuids(text: str) -> str:
    return UUID_RE.sub("<id>", text)


class MaskUUIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and record.args:
            record.args = tuple(mask_uuids(a) if isinstance(a, str) else a for a in record.args)
        if isinstance(record.msg, str):
            record.msg = mask_uuids(record.msg)
        return True


def install_access_log_filter() -> None:
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, MaskUUIDFilter) for f in access.filters):
        access.addFilter(MaskUUIDFilter())
