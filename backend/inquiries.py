"""
CP-JK-101 — Trainingsanfragen (Training Inquiry Flow).

Warum ein eigenes Modul statt einer Erweiterung von main.py:

`backend/main.py` wird von BEIDEN Render-Services ausgeliefert — dem von KSV
Baunatal, der in Produktion läuft, und dem isolierten JK-Service. Jede Zeile
dort trägt Produktionsrisiko für KSV. Dieses Modul hält die neue Funktion
davon getrennt; main.py bekommt nur den Aufruf der Factory.

Abgeschaltet ist die Funktion vollständig abwesend: Ist INQUIRIES_ENABLED nicht
gesetzt, registriert die Factory keine einzige Route. Auf dem KSV-Service
existiert `/inquiries` damit nicht — kein 500er auf eine fehlende Tabelle, kein
zusätzlicher Angriffspunkt, keine Änderung an der OpenAPI-Beschreibung.

Datenschutz: Hier werden Daten Minderjähriger verarbeitet. Bewusst gespeichert
wird nur das GEBURTSJAHR, nicht das vollständige Geburtsdatum — für die
Einordnung einer Trainingsanfrage reicht der Jahrgang, und weniger Daten sind
weniger Risiko (DSGVO Art. 5 Abs. 1 lit. c, Datenminimierung).
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Callable, Optional

import psycopg2
import psycopg2.pool
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator

logger = logging.getLogger(__name__)

# Sanity-Grenzen für den Jahrgang. Das ist BEWUSST keine Altersregel:
# Die gilt pro Mandant und steht in GET /config (camp.age_min/age_max). JKs
# Camps laufen 6–14, die KSV-DB erlaubt 5–18 — diese Widersprüche sind in
# TODO.md (T01) offen und werden hier nicht stillschweigend entschieden.
# Geprüft wird nur, dass der Jahrgang überhaupt plausibel ist.
BIRTH_YEAR_MAX_AGE = 40


class InquiryIn(BaseModel):
    """Eingehende Trainingsanfrage."""

    player_name: str
    birth_year: int
    topic: str
    parent_email: EmailStr
    message: Optional[str] = None
    consent_privacy: bool

    @field_validator("player_name", "topic")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Darf nicht leer sein.")
        return v.strip()

    @field_validator("player_name")
    @classmethod
    def name_length(cls, v: str) -> str:
        if len(v) > 120:
            raise ValueError("Name ist zu lang (max. 120 Zeichen).")
        return v

    @field_validator("topic")
    @classmethod
    def topic_length(cls, v: str) -> str:
        if len(v) > 120:
            raise ValueError("Angabe ist zu lang (max. 120 Zeichen).")
        return v

    @field_validator("message")
    @classmethod
    def message_length(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > 2000:
            raise ValueError("Nachricht ist zu lang (max. 2000 Zeichen).")
        return v

    @field_validator("birth_year")
    @classmethod
    def plausible_year(cls, v: int) -> int:
        this_year = date.today().year
        if v < this_year - BIRTH_YEAR_MAX_AGE or v > this_year:
            raise ValueError(f"Jahrgang muss zwischen {this_year - BIRTH_YEAR_MAX_AGE} und {this_year} liegen.")
        return v

    @field_validator("consent_privacy")
    @classmethod
    def must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Datenschutzerklärung muss akzeptiert werden.")
        return v


class InquiryOut(BaseModel):
    """Antwort auf eine gespeicherte Anfrage. Bewusst ohne personenbezogene Felder."""

    id: str
    created_at: str


def create_inquiries_router(
    *,
    enabled: bool,
    notify_email: str,
    club_name: str,
    allowed_topics: list[str],
    brevo_api_key: str,
    email_from: str,
    email_from_name: str,
    db_cursor: Callable[..., Any],
    http_client: Any,
) -> APIRouter:
    """
    Baut den Router für Trainingsanfragen.

    Ist `enabled` False, wird bewusst ein LEERER Router zurückgegeben — die
    Route existiert dann nirgends, statt zur Laufzeit einen Fehler zu werfen.

    `allowed_topics` leer bedeutet: keine Allowlist. Das Thema wird dann nur auf
    „nicht leer, höchstens 120 Zeichen" geprüft. So koppelt eine Textänderung im
    Frontend (ein neues Programm in der Auswahl) kein Backend-Deployment.
    """
    router = APIRouter(tags=["Inquiries"])

    if not enabled:
        logger.info("Trainingsanfragen deaktiviert (INQUIRIES_ENABLED nicht gesetzt) — /inquiries wird nicht registriert.")
        return router

    if not notify_email:
        logger.warning(
            "INQUIRIES_ENABLED ist gesetzt, INQUIRY_NOTIFY_EMAIL aber leer. "
            "Anfragen werden gespeichert, es geht jedoch keine Benachrichtigung raus."
        )

    def _notify(row: dict) -> None:
        """
        Benachrichtigt den Verein über eine neue Anfrage. Best effort:
        Ein Fehler hier darf die bereits gespeicherte Anfrage nie verwerfen.

        Reply-To ist die E-Mail des Elternteils — eine Antwort aus dem
        Postfach geht damit direkt an die richtige Person.
        """
        if not (brevo_api_key and email_from and notify_email):
            logger.info("Benachrichtigung übersprungen: Mailversand nicht vollständig konfiguriert.")
            return

        message = row.get("message") or "—"
        html = (
            f"<h2 style=\"font-family:sans-serif\">Neue Trainingsanfrage</h2>"
            f"<table style=\"font-family:sans-serif;font-size:14px;border-collapse:collapse\">"
            f"<tr><td style=\"padding:4px 12px 4px 0\"><b>Spieler</b></td><td>{row['player_name']}</td></tr>"
            f"<tr><td style=\"padding:4px 12px 4px 0\"><b>Jahrgang</b></td><td>{row['birth_year']}</td></tr>"
            f"<tr><td style=\"padding:4px 12px 4px 0\"><b>Thema</b></td><td>{row['topic']}</td></tr>"
            f"<tr><td style=\"padding:4px 12px 4px 0\"><b>E-Mail</b></td><td>{row['parent_email']}</td></tr>"
            f"<tr><td style=\"padding:4px 12px 4px 0;vertical-align:top\"><b>Nachricht</b></td><td>{message}</td></tr>"
            f"</table>"
        )
        text = (
            "Neue Trainingsanfrage\n\n"
            f"Spieler:  {row['player_name']}\n"
            f"Jahrgang: {row['birth_year']}\n"
            f"Thema:    {row['topic']}\n"
            f"E-Mail:   {row['parent_email']}\n"
            f"Nachricht:\n{message}\n"
        )

        try:
            resp = http_client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": brevo_api_key, "Content-Type": "application/json"},
                json={
                    "sender": {"name": email_from_name, "email": email_from},
                    "to": [{"email": notify_email, "name": club_name}],
                    "subject": f"Neue Trainingsanfrage – {row['player_name']} ({row['topic']})",
                    "htmlContent": html,
                    "textContent": text,
                    "replyTo": {"email": row["parent_email"], "name": row["player_name"]},
                },
                timeout=10,
            )
            resp.raise_for_status()

            with db_cursor() as cur:
                cur.execute(
                    "UPDATE training_inquiries SET notified_at = now() WHERE id = %s",
                    (str(row["id"]),),
                )
            logger.info("Benachrichtigung zu Anfrage id=%s gesendet.", row.get("id"))

        except Exception as exc:
            logger.warning(
                "Benachrichtigung zu Anfrage id=%s fehlgeschlagen: %s — Anfrage bleibt gespeichert.",
                row.get("id"),
                exc,
            )

    @router.post(
        "/inquiries",
        status_code=status.HTTP_201_CREATED,
        response_model=InquiryOut,
        summary="Trainingsanfrage einreichen (öffentlich)",
    )
    def create_inquiry(payload: InquiryIn) -> dict:
        if allowed_topics and payload.topic not in allowed_topics:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unbekanntes Thema.",
            )

        sql = """
            INSERT INTO training_inquiries (
                player_name, birth_year, topic, parent_email, message, consent_privacy
            ) VALUES (
                %(player_name)s, %(birth_year)s, %(topic)s,
                %(parent_email)s, %(message)s, %(consent_privacy)s
            )
            RETURNING id, created_at, player_name, birth_year, topic, parent_email, message
        """
        try:
            with db_cursor() as cur:
                cur.execute(sql, payload.model_dump())
                row = dict(cur.fetchone())
        except psycopg2.errors.CheckViolation as exc:
            name = exc.diag.constraint_name or ""
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Ungültige Eingabe ({name}).",
            )
        except psycopg2.errors.UndefinedTable:
            # Die Migration wurde noch nicht eingespielt. Klar benennen statt
            # den Aufrufer mit einem generischen 502 ratlos zu lassen.
            logger.error("Tabelle training_inquiries fehlt — Migration nicht eingespielt.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Anfragen sind gerade nicht möglich.",
            )
        except psycopg2.pool.PoolError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Keine freie Datenbankverbindung: {exc}",
            )
        except Exception as exc:
            logger.error("Anfrage konnte nicht gespeichert werden: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Anfrage konnte nicht gespeichert werden.",
            )

        # Anfrage ist committed. Benachrichtigung ist best effort.
        _notify(row)

        return {"id": str(row["id"]), "created_at": row["created_at"].isoformat()}

    return router
