"""
CSV parsing for the club membership import. Pure: no DB, no logging.

Child data (names, birth dates) must never leave this module through error
messages: MembershipCsvError carries only {row, field, code}. `row` is the
1-based record number in the file, the header being row 1.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from typing import Optional

MAX_ROWS = 2000
MAX_NAME_LEN = 100
MAX_NUMBER_LEN = 50
_MIN_BIRTH_YEAR = 1900

_DATE_DE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$")
_DATE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_REQUIRED = ("vorname", "nachname", "geburtsdatum")


class MembershipCsvError(Exception):
    def __init__(self, errors: list[dict]):
        super().__init__("invalid membership csv")
        self.errors = errors


def parse_birth_date(value: str) -> Optional[date]:
    value = value.strip()
    try:
        if m := _DATE_DE.match(value):
            parsed = date(int(m[3]), int(m[2]), int(m[1]))
        elif m := _DATE_ISO.match(value):
            parsed = date(int(m[1]), int(m[2]), int(m[3]))
        else:
            return None
    except ValueError:
        return None
    if parsed.year < _MIN_BIRTH_YEAR or parsed > date.today():
        return None
    return parsed


def _err(row: int, field: str, code: str) -> dict:
    return {"row": row, "field": field, "code": code}


def parse_membership_csv(text: str) -> list[dict]:
    text = text.lstrip("﻿")
    if not text.strip():
        raise MembershipCsvError([_err(1, "file", "empty_file")])
    if "\x00" in text:
        raise MembershipCsvError([_err(1, "file", "invalid_csv")])
    first_line = next(line for line in text.splitlines() if line.strip())
    delimiter = ";" if first_line.count(";") >= first_line.count(",") and ";" in first_line else ","

    try:
        records = [r for r in csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)]
    except csv.Error:
        raise MembershipCsvError([_err(1, "file", "invalid_csv")]) from None
    # Record numbers count every record incl. blank ones, so they match the file.
    head = next(i for i, r in enumerate(records) if any(c.strip() for c in r))
    header = [h.strip().casefold() for h in records[head]]
    errors = [_err(head + 1, name, "missing_column") for name in _REQUIRED if name not in header]
    if errors:
        raise MembershipCsvError(errors)
    idx = {name: header.index(name) for name in (*_REQUIRED, *(["mitgliedsnummer"] if "mitgliedsnummer" in header else []))}

    data = [(n, r) for n, r in enumerate(records[head + 1:], start=head + 2) if any(c.strip() for c in r)]
    if not data:
        raise MembershipCsvError([_err(1, "file", "no_rows")])
    if len(data) > MAX_ROWS:
        raise MembershipCsvError([_err(data[MAX_ROWS][0], "file", "too_many_rows")])

    rows: list[dict] = []
    for n, rec in data:
        if len(rec) != len(header):
            errors.append(_err(n, "row", "column_count"))
            continue
        first = rec[idx["vorname"]].strip()
        last = rec[idx["nachname"]].strip()
        number = rec[idx["mitgliedsnummer"]].strip() if "mitgliedsnummer" in idx else ""
        row_ok = True
        for field, value, limit in (("vorname", first, MAX_NAME_LEN), ("nachname", last, MAX_NAME_LEN)):
            if not value:
                errors.append(_err(n, field, "required"))
                row_ok = False
            elif len(value) > limit:
                errors.append(_err(n, field, "too_long"))
                row_ok = False
        born = parse_birth_date(rec[idx["geburtsdatum"]])
        if born is None:
            errors.append(_err(n, "geburtsdatum", "invalid_date"))
            row_ok = False
        if len(number) > MAX_NUMBER_LEN:
            errors.append(_err(n, "mitgliedsnummer", "too_long"))
            row_ok = False
        if row_ok:
            rows.append(dict(first_name=first, last_name=last, birth_date=born, member_number=number or None))
    if errors:
        raise MembershipCsvError(errors)
    return rows
