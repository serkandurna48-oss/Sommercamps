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
MAX_EXTRA_FIELDS = 10
MAX_EXTRA_LABEL_LEN = 40
MAX_EXTRA_VALUE_LEN = 200
MAX_MAPPING_KEYS = 200
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


def _read_records(text: str) -> tuple[int, list[list[str]]]:
    """Decode-level checks + csv.reader. Returns (index of the header record, records)."""
    text = text.lstrip("\ufeff")
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
    return head, records


def _data_records(head: int, records: list[list[str]]) -> list[tuple[int, list[str]]]:
    data = [(n, r) for n, r in enumerate(records[head + 1:], start=head + 2) if any(c.strip() for c in r)]
    if not data:
        raise MembershipCsvError([_err(1, "file", "no_rows")])
    if len(data) > MAX_ROWS:
        raise MembershipCsvError([_err(data[MAX_ROWS][0], "file", "too_many_rows")])
    return data


def _parse_rows(data: list[tuple[int, list[str]]], width: int, idx: dict[str, int],
                extras: dict[int, str], errors: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for n, rec in data:
        if len(rec) != width:
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
        extra: dict[str, str] = {}
        for col, label in extras.items():
            value = rec[col].strip()
            if len(value) > MAX_EXTRA_VALUE_LEN:
                errors.append(_err(n, label, "too_long"))
                row_ok = False
            elif value:
                extra[label] = value
        if row_ok:
            row = dict(first_name=first, last_name=last, birth_date=born, member_number=number or None)
            if extras:
                row["extra"] = extra
            rows.append(row)
    return rows


def parse_membership_csv(text: str, mapping: Optional[dict] = None) -> list[dict]:
    """Without `mapping`: exact headers vorname/nachname/geburtsdatum (+ optional
    mitgliedsnummer), other columns ignored. With `mapping` (column index ->
    target, see parse_mapping) the header names do not matter and rows get an
    `extra` dict {label: value} (empty values left out)."""
    head, records = _read_records(text)
    if mapping is not None:
        width = len(records[head])
        idx, extras = parse_mapping(mapping, width)
        data = _data_records(head, records)
        errors: list[dict] = []
        rows = _parse_rows(data, width, idx, extras, errors)
        if errors:
            raise MembershipCsvError(errors)
        return rows

    header = [h.strip().casefold() for h in records[head]]
    errors = [_err(head + 1, name, "missing_column") for name in _REQUIRED if name not in header]
    if errors:
        raise MembershipCsvError(errors)
    idx = {name: header.index(name) for name in (*_REQUIRED, *(["mitgliedsnummer"] if "mitgliedsnummer" in header else []))}
    data = _data_records(head, records)
    rows = _parse_rows(data, len(header), idx, {}, errors)
    if errors:
        raise MembershipCsvError(errors)
    return rows


_TARGETS = {"first_name": "vorname", "last_name": "nachname", "birth_date": "geburtsdatum",
            "member_number": "mitgliedsnummer"}


def clean_extra_label(value: object) -> Optional[str]:
    """Trimmed label, inner whitespace runs collapsed; None if not a usable label."""
    if not isinstance(value, str):
        return None
    label = " ".join(value.split())
    if not label or len(label) > MAX_EXTRA_LABEL_LEN or any(ord(ch) < 32 for ch in label):
        return None
    return label


def parse_mapping(mapping: object, width: int) -> tuple[dict[str, int], dict[int, str]]:
    """Validate {columnIndex: "first_name"|"last_name"|"birth_date"|"member_number"|
    {"extra": label}|None}. Returns ({field: column}, {column: label}). Errors are
    {row: 1, field, code}; `field` is the mapping key, a German field name or the
    extra label (never a cell value)."""
    if not isinstance(mapping, dict) or len(mapping) > MAX_MAPPING_KEYS:
        raise MembershipCsvError([_err(1, "mapping", "invalid_mapping")])
    errors: list[dict] = []
    idx: dict[str, int] = {}
    extras: dict[int, str] = {}
    seen_labels: set[str] = set()
    for key, target in mapping.items():
        try:
            col = int(key)
        except (TypeError, ValueError):
            errors.append(_err(1, "mapping", "invalid_column"))
            continue
        if col < 0 or col >= width or str(col) != str(key).strip():
            errors.append(_err(1, "mapping", "invalid_column"))
            continue
        if target is None:
            continue
        if isinstance(target, str) and target in _TARGETS:
            field = _TARGETS[target]
            if field in idx:
                errors.append(_err(1, field, "duplicate_mapping"))
            else:
                idx[field] = col
            continue
        if isinstance(target, dict) and set(target) == {"extra"}:
            label = clean_extra_label(target["extra"])
            if label is None:
                errors.append(_err(1, "extra", "invalid_label"))
                continue
            folded = label.casefold()
            if folded in seen_labels or folded in _TARGETS.values():
                errors.append(_err(1, label, "duplicate_label"))
                continue
            seen_labels.add(folded)
            extras[col] = label
            continue
        errors.append(_err(1, "mapping", "invalid_target"))
    for field in _REQUIRED:
        if field not in idx and not any(e["field"] == field for e in errors):
            errors.append(_err(1, field, "missing_mapping"))
    if len(extras) > MAX_EXTRA_FIELDS:
        errors.append(_err(1, "extra", "too_many_extra_fields"))
    if errors:
        raise MembershipCsvError(errors)
    return idx, dict(sorted(extras.items()))
