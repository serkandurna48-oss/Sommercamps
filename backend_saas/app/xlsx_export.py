"""
Generic .xlsx generation for admin exports (Teilnehmerliste/Zahlungen/
Warteliste, CampsPilot Richtung-C Auftrag "Export"). Pure formatting layer:
takes already-computed headers/rows, never queries the database itself, so
it can never drift from what the calling endpoint actually authorized and
fetched. Chosen over a JS xlsx library in the frontend specifically because
the two common npm packages for this (xlsx/SheetJS, exceljs) both carry
unpatched vulnerabilities in their published dependency trees as of this
writing (prototype pollution / ReDoS) — openpyxl is pure Python with a
clean security history and this app already has a Python backend, so
generating the file server-side avoids the tradeoff entirely.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

_HEADER_FILL = PatternFill(start_color="131A17", end_color="131A17", fill_type="solid")
_HEADER_FONT = Font(color="FFFFFF", bold=True)
_MAX_COLUMN_WIDTH = 50
_MIN_COLUMN_WIDTH = 10


_FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _excel_safe(value: object) -> object:
    """Excel's datetime cells have no concept of timezone — openpyxl raises
    on a tz-aware value (e.g. `created_at` from a `timestamptz` column)
    rather than silently dropping it. Strip tzinfo (keeps the same
    wall-clock value) instead of pushing this concern onto every caller.

    Also guards against CSV/Excel formula injection: every string column
    here ultimately comes from parent-supplied free text (name, allergies,
    medical notes, emergency contact, ...) — an admin could unknowingly
    export and open a row where e.g. `allergies` is
    `=HYPERLINK("http://evil","click")` or a DDE/exec payload starting with
    `=`/`+`/`-`/`@`. A leading apostrophe forces Excel/LibreOffice to treat
    the cell as literal text instead of evaluating it, without changing
    the value the admin sees."""
    if isinstance(value, datetime) and value.tzinfo is not None:
        value = value.replace(tzinfo=None)
    if isinstance(value, str) and value.startswith(_FORMULA_TRIGGER_CHARS):
        return "'" + value
    return value


def build_xlsx(headers: list[str], rows: list[list[object]], sheet_name: str = "Export") -> bytes:
    """
    One sheet, a dark header row (mirrors --cp-band), auto-sized columns,
    frozen header. `rows` values are written as-is — openpyxl natively
    understands `str`/`int`/`bool`/`datetime.date`/`datetime.datetime`,
    which covers every column type this app exports (no manual
    stringification needed, and dates render as real Excel dates, not
    text).
    """
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name[:31]  # Excel's own sheet-name length limit

    widths = [len(header) for header in headers]

    for col_idx, header in enumerate(headers, start=1):
        cell = sheet.cell(row=1, column=col_idx, value=header)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL

    for row_idx, row in enumerate(rows, start=2):
        for col_idx, value in enumerate(row, start=1):
            sheet.cell(row=row_idx, column=col_idx, value=_excel_safe(value))
            if value is not None:
                widths[col_idx - 1] = max(widths[col_idx - 1], len(str(value)))

    for col_idx, widest in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(col_idx)].width = min(max(widest + 2, _MIN_COLUMN_WIDTH), _MAX_COLUMN_WIDTH)

    sheet.freeze_panes = "A2"

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
