"""Input rules for person names.

Mystery-shopper finding 18.11.2026: `<script>` was accepted and stored as a
child's name. Output is escaped everywhere today (React, mail templates, the
XLSX guard), but stored markup stays a risk for every future consumer, so
names are now checked when they come in.

The rule is a short denylist, not an allowlist, on purpose. Parents type and
paste names in every script and with every keyboard: typographic hyphens and
apostrophes, non-breaking spaces, right-to-left marks, nicknames in quotes,
two people in one field. A strict allowlist turns such input into a failed
registration with a message the parent cannot act on. What is refused is only
what no name contains and what markup or a spreadsheet formula needs:

- `<`, `>` and `=`
- control characters, line and paragraph separators
- bidirectional override/isolate characters (can disguise what a list shows)

and the value must contain at least one letter. Existing rows are not touched.
"""

from __future__ import annotations

import unicodedata

NAME_MAX = 80
PEOPLE_LIST_MAX = 300
_FORBIDDEN = frozenset("<>=")
# U+202A-U+202E embeddings/overrides, U+2066-U+2069 isolates. LRM/RLM and the
# zero-width joiners stay allowed: RTL keyboards and Persian/Indic spelling use them.
_BIDI_CONTROLS = frozenset(chr(c) for c in (*range(0x202A, 0x202F), *range(0x2066, 0x206A)))
NAME_TEXT_MSG = "Bitte verwenden Sie keine Zeichen wie < > oder = und keine Zeilenumbrüche."
NAME_LETTER_MSG = "Bitte geben Sie einen Namen mit Buchstaben an."


def _is_letter(char: str) -> bool:
    return unicodedata.category(char)[0] == "L"


def _is_forbidden(char: str, allow_newline: bool) -> bool:
    if char in _FORBIDDEN or char in _BIDI_CONTROLS:
        return True
    if allow_newline and char == "\n":
        return False
    return unicodedata.category(char) in ("Cc", "Zl", "Zp")


def _validate(value: str, max_length: int, allow_newline: bool) -> str:
    if len(value) > max_length:
        raise ValueError(f"Bitte höchstens {max_length} Zeichen.")
    if any(_is_forbidden(char, allow_newline) for char in value):
        raise ValueError(NAME_TEXT_MSG)
    if not any(_is_letter(char) for char in value):
        raise ValueError(NAME_LETTER_MSG)
    return value


def validate_name_text(value: str) -> str:
    """One person's name (child, parent, emergency contact). Empty input is left to min_length."""
    return _validate(value, NAME_MAX, allow_newline=False) if value else value


def validate_people_list(value: str) -> str:
    """Free list of people ("Oma Erna, Tante Ayşe"), one or several lines."""
    return _validate(value, PEOPLE_LIST_MAX, allow_newline=True) if value else value
