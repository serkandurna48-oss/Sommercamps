"""CSV import for sales leads: tolerant header mapping, no network, no DB.

Accepts ";" or "," separated files (Excel exports, the lead research
CSV), with or without BOM. Unknown columns are reported, never stored.
A row without a name is invalid; a malformed e-mail is dropped from the
row instead of rejecting it. Duplicates (same name + city, case-insensitive)
against existing leads and within the file are skipped."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field

_HEADER_MAP = {
    "name": ("name", "verein", "club", "organisation", "organization", "schule", "fussballschule", "fußballschule", "anbieter", "firma", "lead"),
    "city": ("ort", "stadt", "city", "standort", "region"),
    "website": ("website", "webseite", "homepage", "url", "web"),
    "fit": ("passung", "fit", "prio", "prioritaet", "priorität", "klasse", "abc"),
    "source_url": ("quelle", "quell-url", "quellurl", "quelle_url", "source", "source_url", "beleg"),
    "contact_name": ("ansprechpartner", "kontakt", "kontaktperson", "contact", "contact_name"),
    "phone": ("telefon", "tel", "phone", "telefonnummer"),
    "email": ("email", "e-mail", "mail", "e_mail"),
    "kind": ("typ", "art", "kind", "type"),
    "note": ("notiz", "notizen", "bemerkung", "note", "notes", "hinweis", "anmerkung", "anmeldung", "anmeldeweg"),
}
_LIMITS = {"name": 200, "city": 120, "website": 500, "contact_name": 120, "phone": 60, "email": 254, "source_url": 500, "note": 4000}
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_SCHOOL_HINTS = ("fußballschule", "fussballschule", "academy", "akademie", "soccer")


@dataclass
class ParsedImport:
    rows: list[dict] = field(default_factory=list)
    invalid: int = 0
    duplicates: int = 0
    unknown_columns: list[str] = field(default_factory=list)


def _normalize_header(header: str) -> str:
    return header.strip().strip("﻿").lower().replace(" ", "_")


def _column_for(header: str) -> str | None:
    key = _normalize_header(header)
    for column, aliases in _HEADER_MAP.items():
        if key in aliases or key.replace("_", "") in aliases or key.replace("_", "-") in aliases:
            return column
    return None


def _kind(raw: str | None, name: str) -> str:
    text = (raw or "").lower()
    if "schule" in text or "akadem" in text or "academy" in text:
        return "fussballschule"
    if "verein" in text or "club" in text:
        return "verein"
    if raw and raw.strip():
        return "sonstige"
    compact = re.sub(r"[\s\-_.]", "", name.lower())
    return "fussballschule" if any(hint in compact for hint in _SCHOOL_HINTS) else "verein"


def _url(value: str | None) -> str | None:
    if not value or any(ch.isspace() for ch in value.strip()):
        return None
    value = value.strip()
    return value if value.lower().startswith(("http://", "https://")) else f"https://{value}"


def parse_leads_csv(text: str, existing_keys: set[tuple[str, str]]) -> ParsedImport:
    text = text.lstrip("﻿")
    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    result = ParsedImport()
    mapping: dict[str, str] = {}
    for header in reader.fieldnames or []:
        column = _column_for(header or "")
        if column and column not in mapping.values():
            mapping[header] = column
        elif header and header.strip():
            result.unknown_columns.append(header.strip())
    if "name" not in mapping.values():
        raise ValueError("Keine Spalte für den Namen gefunden (z. B. „Name“ oder „Verein“).")

    seen = set(existing_keys)
    for raw in reader:
        row: dict = {}
        for header, column in mapping.items():
            value = (raw.get(header) or "").strip()
            if value:
                row[column] = value[: _LIMITS[column]] if column in _LIMITS else value
        name = row.get("name")
        if not name:
            result.invalid += 1
            continue
        key = (name.lower(), (row.get("city") or "").lower())
        if key in seen:
            result.duplicates += 1
            continue
        seen.add(key)
        fit = (row.get("fit") or "").strip().upper()[:1]
        row["fit"] = fit if fit in ("A", "B", "C") else None
        row["kind"] = _kind(row.get("kind"), name)
        row["website"] = _url(row.get("website"))
        row["source_url"] = _url(row.get("source_url"))
        if row.get("email") and not _EMAIL.match(row["email"]):
            row.pop("email")
        result.rows.append(row)
    return result
