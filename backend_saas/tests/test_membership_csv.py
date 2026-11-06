"""Pure CSV parsing for the membership import (no DB). Synthetic data only."""

from datetime import date

import pytest

from app.membership_csv import MAX_ROWS, MembershipCsvError, parse_membership_csv


def test_semicolon_german_dates():
    rows = parse_membership_csv("vorname;nachname;geburtsdatum;mitgliedsnummer\nAnna;Muster;05.03.2015;M-1\n")
    assert rows == [dict(first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5), member_number="M-1")]


def test_comma_iso_dates_bom_and_crlf():
    text = "﻿Vorname,Nachname,Geburtsdatum,Mitgliedsnummer\r\nAnna,Muster,2015-03-05,\r\nBen,Beispiel,2014-12-31,77\r\n"
    rows = parse_membership_csv(text)
    assert [r["birth_date"] for r in rows] == [date(2015, 3, 5), date(2014, 12, 31)]
    assert rows[0]["member_number"] is None
    assert rows[1]["member_number"] == "77"


def test_member_number_column_optional_and_blank_lines_skipped():
    rows = parse_membership_csv("vorname;nachname;geburtsdatum\n\nAnna;Muster;05.03.2015\n\n")
    assert len(rows) == 1 and rows[0]["member_number"] is None


def test_quoted_comma_in_name_with_comma_delimiter():
    rows = parse_membership_csv('vorname,nachname,geburtsdatum\n"Anna, Lena",Muster,2015-03-05\n')
    assert rows[0]["first_name"] == "Anna, Lena"


def _errors(text):
    with pytest.raises(MembershipCsvError) as exc:
        parse_membership_csv(text)
    return exc.value.errors


def test_errors_collect_all_rows_and_never_contain_values():
    errs = _errors(
        "vorname;nachname;geburtsdatum;mitgliedsnummer\n"
        "Geheim;Kind;31.02.2015;1\n"       # row 2 invalid date
        "Ok;Fine;05.03.2015;2\n"
        ";Leer;05.03.2015;3\n"             # row 4 first name missing
        "Zu;Kurz;05.03.2015\n"             # row 5 column count
    )
    assert errs == [
        {"row": 2, "field": "geburtsdatum", "code": "invalid_date"},
        {"row": 4, "field": "vorname", "code": "required"},
        {"row": 5, "field": "row", "code": "column_count"},
    ]
    assert "Geheim" not in repr(errs) and "2015" not in repr(errs)


def test_future_and_ancient_birth_dates_rejected():
    errs = _errors("vorname;nachname;geburtsdatum\nA;B;2999-01-01\nC;D;1800-01-01\n")
    assert [e["code"] for e in errs] == ["invalid_date", "invalid_date"]


def test_missing_header_columns():
    errs = _errors("vorname;nachname\nA;B\n")
    assert errs == [{"row": 1, "field": "geburtsdatum", "code": "missing_column"}]


def test_empty_file_and_header_only():
    assert _errors("") == [{"row": 1, "field": "file", "code": "empty_file"}]
    assert _errors("vorname;nachname;geburtsdatum\n") == [{"row": 1, "field": "file", "code": "no_rows"}]


def test_too_many_rows():
    body = "vorname;nachname;geburtsdatum\n" + "A;B;2015-01-01\n" * (MAX_ROWS + 1)
    assert _errors(body) == [{"row": MAX_ROWS + 2, "field": "file", "code": "too_many_rows"}]


def test_exactly_max_rows_ok():
    body = "vorname;nachname;geburtsdatum\n" + "A;B;2015-01-01\n" * MAX_ROWS
    assert len(parse_membership_csv(body)) == MAX_ROWS


def test_field_too_long():
    errs = _errors("vorname;nachname;geburtsdatum;mitgliedsnummer\nA;B;2015-01-01;" + "9" * 60 + "\n")
    assert errs == [{"row": 2, "field": "mitgliedsnummer", "code": "too_long"}]


def test_leading_blank_lines_before_header():
    rows = parse_membership_csv("\n\nvorname;nachname;geburtsdatum\nAnna;Muster;05.03.2015\n")
    assert len(rows) == 1
    assert _errors("\n\nvorname;nachname;geburtsdatum\nA;B;kaputt\n") == [{"row": 4, "field": "geburtsdatum", "code": "invalid_date"}]


def test_nul_byte_and_oversized_field_are_invalid_csv():
    assert _errors("vorname;nachname;geburtsdatum\nA\x00;B;2015-01-01\n") == [{"row": 1, "field": "file", "code": "invalid_csv"}]
    assert _errors('vorname;nachname;geburtsdatum\n"' + "x" * 200000 + '";B;2015-01-01\n') == [{"row": 1, "field": "file", "code": "invalid_csv"}]
