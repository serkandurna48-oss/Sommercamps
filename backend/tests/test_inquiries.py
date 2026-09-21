"""
Tests für CP-JK-101 (Trainingsanfragen).

Getestet wird der Router direkt statt über einen HTTP-Client: `httpx` ist keine
Abhängigkeit dieses Projekts, und der interessante Teil liegt ohnehin in
Validierung, SQL und Benachrichtigung — nicht im Transport.

Abgedeckt sind alle Pfade, die Datenbank oder externe Dienste anfassen
(CLAUDE.md, Sicherheitspflichten).
"""

from __future__ import annotations

import sys
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from inquiries import InquiryIn, create_inquiries_router  # noqa: E402


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

ROW = {
    "id": "11111111-2222-3333-4444-555555555555",
    "created_at": datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc),
    "player_name": "Max Mustermann",
    "birth_year": 2013,
    "topic": "Individualtraining",
    "parent_email": "anna@beispiel.de",
    "message": "Er will an seinem Abschluss arbeiten.",
}


class FakeCursor:
    def __init__(self, store: dict, error: BaseException | None = None):
        self.store = store
        self.error = error

    def execute(self, sql: str, params: Any = None) -> None:
        if self.error is not None:
            raise self.error
        self.store.setdefault("calls", []).append((sql, params))

    def fetchone(self) -> dict:
        return dict(ROW)


def make_db_cursor(store: dict, error: BaseException | None = None):
    @contextmanager
    def db_cursor():
        yield FakeCursor(store, error)

    return db_cursor


class FakeResponse:
    def __init__(self, fail: bool = False):
        self.fail = fail

    def raise_for_status(self) -> None:
        if self.fail:
            raise RuntimeError("Brevo antwortet nicht")


class FakeHttp:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.posts: list[dict] = []

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.posts.append({"url": url, **kwargs})
        return FakeResponse(self.fail)


def build_router(*, store=None, db_error=None, http=None, enabled=True, topics=None, notify="jk@example.test"):
    return create_inquiries_router(
        enabled=enabled,
        notify_email=notify,
        club_name="JK Performance Academy",
        allowed_topics=topics if topics is not None else [],
        brevo_api_key="key",
        email_from="noreply@example.test",
        email_from_name="JK Performance Academy",
        db_cursor=make_db_cursor(store if store is not None else {}, db_error),
        http_client=http if http is not None else FakeHttp(),
    )


def handler_of(router):
    """Holt die Endpunkt-Funktion aus dem Router."""
    return router.routes[0].endpoint


def valid_payload(**overrides: Any) -> InquiryIn:
    data = {
        "player_name": "Max Mustermann",
        "birth_year": 2013,
        "topic": "Individualtraining",
        "parent_email": "anna@beispiel.de",
        "message": "Er will an seinem Abschluss arbeiten.",
        "consent_privacy": True,
    }
    data.update(overrides)
    return InquiryIn(**data)


# ---------------------------------------------------------------------------
# Feature-Schalter — schützt die KSV-Produktion
# ---------------------------------------------------------------------------

def test_router_ohne_flag_registriert_keine_route():
    router = build_router(enabled=False)
    assert router.routes == []


def test_router_mit_flag_registriert_genau_eine_route():
    router = build_router(enabled=True)
    assert len(router.routes) == 1
    assert router.routes[0].path == "/inquiries"
    assert router.routes[0].methods == {"POST"}


# ---------------------------------------------------------------------------
# Validierung
# ---------------------------------------------------------------------------

def test_leerer_name_wird_abgelehnt():
    with pytest.raises(ValidationError):
        valid_payload(player_name="   ")


def test_fehlende_einwilligung_wird_abgelehnt():
    with pytest.raises(ValidationError):
        valid_payload(consent_privacy=False)


def test_ungueltige_email_wird_abgelehnt():
    with pytest.raises(ValidationError):
        valid_payload(parent_email="keine-email")


def test_jahrgang_in_der_zukunft_wird_abgelehnt():
    with pytest.raises(ValidationError):
        valid_payload(birth_year=date.today().year + 1)


def test_unplausibel_alter_jahrgang_wird_abgelehnt():
    with pytest.raises(ValidationError):
        valid_payload(birth_year=date.today().year - 41)


def test_zu_lange_nachricht_wird_abgelehnt():
    with pytest.raises(ValidationError):
        valid_payload(message="x" * 2001)


def test_leere_nachricht_wird_zu_none():
    assert valid_payload(message="   ").message is None


def test_name_wird_getrimmt():
    assert valid_payload(player_name="  Max  ").player_name == "Max"


# ---------------------------------------------------------------------------
# Speichern
# ---------------------------------------------------------------------------

def test_anfrage_wird_gespeichert_und_gibt_id_zurueck():
    store: dict = {}
    result = handler_of(build_router(store=store))(valid_payload())

    assert result["id"] == ROW["id"]
    assert result["created_at"] == ROW["created_at"].isoformat()

    insert_sql, params = store["calls"][0]
    assert "INSERT INTO training_inquiries" in insert_sql
    # Parameterisiert — keine String-Interpolation, keine SQL-Injection.
    assert "%(player_name)s" in insert_sql
    assert params["player_name"] == "Max Mustermann"
    assert params["consent_privacy"] is True


def test_fehlende_tabelle_liefert_503_statt_502():
    store: dict = {}
    router = build_router(store=store, db_error=psycopg2.errors.UndefinedTable())
    with pytest.raises(HTTPException) as exc:
        handler_of(router)(valid_payload())
    assert exc.value.status_code == 503


def test_unerwarteter_dbfehler_liefert_502_ohne_details_nach_aussen():
    router = build_router(db_error=RuntimeError("connection reset by peer"))
    with pytest.raises(HTTPException) as exc:
        handler_of(router)(valid_payload())
    assert exc.value.status_code == 502
    # Interne Fehlermeldung darf nicht nach außen dringen.
    assert "connection reset" not in str(exc.value.detail)


# ---------------------------------------------------------------------------
# Themen-Allowlist
# ---------------------------------------------------------------------------

def test_unbekanntes_thema_wird_abgelehnt_wenn_allowlist_gesetzt():
    router = build_router(topics=["Individualtraining"])
    with pytest.raises(HTTPException) as exc:
        handler_of(router)(valid_payload(topic="Etwas anderes"))
    assert exc.value.status_code == 422


def test_ohne_allowlist_ist_jedes_thema_erlaubt():
    store: dict = {}
    result = handler_of(build_router(store=store, topics=[]))(valid_payload(topic="Etwas anderes"))
    assert result["id"] == ROW["id"]


# ---------------------------------------------------------------------------
# Benachrichtigung
# ---------------------------------------------------------------------------

def test_benachrichtigung_geht_an_den_verein_mit_eltern_als_reply_to():
    http = FakeHttp()
    handler_of(build_router(store={}, http=http))(valid_payload())

    assert len(http.posts) == 1
    body = http.posts[0]["json"]
    assert body["to"][0]["email"] == "jk@example.test"
    # Antworten aus dem Postfach gehen direkt an die Eltern.
    assert body["replyTo"]["email"] == ROW["parent_email"]
    assert ROW["player_name"] in body["subject"]


def test_notified_at_wird_nach_erfolgreichem_versand_gesetzt():
    store: dict = {}
    handler_of(build_router(store=store, http=FakeHttp()))(valid_payload())
    sqls = [sql for sql, _ in store["calls"]]
    assert any("UPDATE training_inquiries SET notified_at" in s for s in sqls)


def test_fehlgeschlagener_versand_verwirft_die_anfrage_nicht():
    store: dict = {}
    result = handler_of(build_router(store=store, http=FakeHttp(fail=True)))(valid_payload())
    # Anfrage bleibt gespeichert und wird normal quittiert.
    assert result["id"] == ROW["id"]
    sqls = [sql for sql, _ in store["calls"]]
    assert not any("notified_at" in s for s in sqls)


def test_ohne_zieladresse_wird_nicht_versendet_aber_gespeichert():
    http = FakeHttp()
    store: dict = {}
    result = handler_of(build_router(store=store, http=http, notify=""))(valid_payload())
    assert result["id"] == ROW["id"]
    assert http.posts == []
