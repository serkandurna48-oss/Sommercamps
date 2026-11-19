"""CSV parser for sales leads (app/sales_import.py) — pure function, no DB."""

from __future__ import annotations

import pytest

from app.sales_import import parse_leads_csv


def test_semicolon_excel_export_with_bom_and_german_headers():
    text = (
        "﻿Verein;Ort;Website;Passung;Quelle;Anmeldeweg;Spalte X\n"
        "Erlebnis-Fußball-Schule;Hann. Münden;erlebnis-fussball.de;a;https://example.com/q1;Word-Formular;foo\n"
        "KSV Hessen Kassel;Kassel;https://ksv.example;B;;Website-Formular;\n"
    )
    result = parse_leads_csv(text, set())
    assert result.unknown_columns == ["Spalte X"]
    first, second = result.rows
    assert first["name"] == "Erlebnis-Fußball-Schule"
    assert first["kind"] == "fussballschule"
    assert first["website"] == "https://erlebnis-fussball.de"
    assert first["fit"] == "A"
    assert first["note"] == "Word-Formular"
    assert second["kind"] == "verein" and second["fit"] == "B" and second["source_url"] is None


def test_comma_separated_english_headers():
    text = "name,city,email,phone,type\nSoccer Academy Kassel,Kassel,info@soccer.example,0561 1,Fußballschule\n"
    [row] = parse_leads_csv(text, set()).rows
    assert row == {
        "name": "Soccer Academy Kassel", "city": "Kassel", "email": "info@soccer.example", "phone": "0561 1",
        "kind": "fussballschule", "fit": None, "website": None, "source_url": None,
    }


def test_duplicates_against_existing_and_within_file_are_skipped_case_insensitive():
    text = "Name;Ort\nRSV Göttingen 05;Göttingen\nrsv göttingen 05;GÖTTINGEN\nSCW Göttingen;Göttingen\nNeu;X\n"
    result = parse_leads_csv(text, {("scw göttingen", "göttingen")})
    assert [r["name"] for r in result.rows] == ["RSV Göttingen 05", "Neu"]
    assert result.duplicates == 2


def test_rows_without_name_are_invalid_and_bad_email_is_dropped():
    text = "Name;E-Mail\n;a@b.example\nVerein A;keine-mail\n"
    result = parse_leads_csv(text, set())
    assert result.invalid == 1
    assert result.rows == [{"name": "Verein A", "kind": "verein", "fit": None, "website": None, "source_url": None}]


def test_overlong_values_are_cut_to_column_limits():
    text = "Name;Ort\n" + "N" * 300 + ";" + "O" * 300 + "\n"
    [row] = parse_leads_csv(text, set()).rows
    assert len(row["name"]) == 200 and len(row["city"]) == 120


def test_missing_name_column_is_a_clear_error():
    with pytest.raises(ValueError, match="Namen"):
        parse_leads_csv("Ort;Website\nKassel;x\n", set())
