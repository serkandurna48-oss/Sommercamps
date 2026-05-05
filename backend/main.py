from __future__ import annotations

import csv
import io
import os
import secrets
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Generator, Optional
from uuid import UUID

import jwt
import psycopg2
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, field_validator

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATABASE_URL: str    = os.environ["DATABASE_URL"]
ADMIN_PASSWORD: str  = os.environ["ADMIN_PASSWORD"]
JWT_SECRET: str      = os.environ["JWT_SECRET"]
TOKEN_EXPIRE_HOURS: int = int(os.getenv("TOKEN_EXPIRE_HOURS", "24"))

ALLOWED_JERSEY_SIZES = {"116", "128", "140", "152", "164", "176", "XS", "S", "M", "L", "XL", "XXL"}
ALLOWED_CAMP_WEEKS = {
    "29.06.–02.07.2026",
    "03.08.–06.08.2026",
    "05.10.–08.10.2026",
}

# ---------------------------------------------------------------------------
# Connection Pool
# ---------------------------------------------------------------------------

# Wird beim App-Start befüllt, beim Shutdown geschlossen.
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _init_pool() -> None:
    """Erzeugt den ThreadedConnectionPool aus DATABASE_URL."""
    global _pool
    # sslmode=require für Supabase Transaction Pooler (falls nicht bereits in der URL)
    dsn = DATABASE_URL if "sslmode=" in DATABASE_URL else DATABASE_URL + "?sslmode=require"
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=dsn,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _close_pool() -> None:
    """Gibt alle Pool-Verbindungen frei."""
    if _pool is not None:
        _pool.closeall()


@contextmanager
def get_db_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Leiht eine Verbindung aus dem Pool aus und gibt sie danach zurück.

    Beispiel:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    if _pool is None:
        raise RuntimeError("Datenbankpool wurde noch nicht initialisiert.")
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


@contextmanager
def db_cursor() -> Generator[psycopg2.extras.RealDictCursor, None, None]:
    """
    Kombinierter Context-Manager: leiht Verbindung aus dem Pool,
    öffnet einen Cursor, committet bei Erfolg, rollt bei Fehler zurück.

    Beispiel:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations")
            rows = cur.fetchall()
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def serialize(row: dict) -> dict:
    """Wandelt psycopg2-Typen (UUID, date, datetime, Decimal) in JSON-kompatible Typen um."""
    out: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, UUID):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, date):
            out[key] = value.isoformat()
        elif isinstance(value, Decimal):
            out[key] = float(value)
        else:
            out[key] = value
    return out


# ---------------------------------------------------------------------------
# Lifespan (Startup / Shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pool beim Start initialisieren, beim Shutdown schließen."""
    _init_pool()
    yield
    _close_pool()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="KSV Baunatal Sommercamp API",
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

CORS_ORIGINS: list[str] = ["http://localhost:3000"]
_extra = os.getenv("CORS_ORIGINS_EXTRA", "")
if _extra:
    CORS_ORIGINS.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class AdminLoginIn(BaseModel):
    password: str


class RegistrationIn(BaseModel):
    child_first_name: str
    child_last_name: str
    birth_date: date
    parent_name: str
    email: EmailStr
    phone: str
    selected_camp_week: str
    jersey_size: Optional[str] = None
    allergies: Optional[str] = None
    notes: Optional[str] = None
    consent_privacy: bool

    @field_validator("child_first_name", "child_last_name", "parent_name", "phone")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Darf nicht leer sein.")
        return v.strip()

    @field_validator("selected_camp_week")
    @classmethod
    def valid_week(cls, v: str) -> str:
        if v not in ALLOWED_CAMP_WEEKS:
            raise ValueError(f"Ungültige Camp-Woche. Erlaubt: {sorted(ALLOWED_CAMP_WEEKS)}")
        return v

    @field_validator("jersey_size")
    @classmethod
    def valid_size(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ALLOWED_JERSEY_SIZES:
            raise ValueError(f"Ungültige Größe. Erlaubt: {sorted(ALLOWED_JERSEY_SIZES)}")
        return v

    @field_validator("consent_privacy")
    @classmethod
    def must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Datenschutzerklärung muss akzeptiert werden.")
        return v


class RegistrationOut(BaseModel):
    id: str
    created_at: str
    child_first_name: str
    child_last_name: str
    birth_date: str
    parent_name: str
    email: str
    phone: str
    selected_camp_week: str
    jersey_size: Optional[str]
    allergies: Optional[str]
    notes: Optional[str]
    consent_privacy: bool
    status: str
    payment_status: str

# ---------------------------------------------------------------------------
# DB Constraint → lesbare Fehlermeldung
# ---------------------------------------------------------------------------

CONSTRAINT_MESSAGES: dict[str, str] = {
    "chk_birth_date_range":          "Das Kind muss zwischen 5 und 18 Jahren alt sein.",
    "chk_child_first_name_not_blank": "Vorname des Kindes darf nicht leer sein.",
    "chk_child_last_name_not_blank":  "Nachname des Kindes darf nicht leer sein.",
    "chk_parent_name_not_blank":      "Name des Elternteils darf nicht leer sein.",
    "chk_phone_not_blank":            "Telefonnummer darf nicht leer sein.",
    "chk_email_format":               "Bitte eine gültige E-Mail-Adresse angeben.",
    "chk_camp_week_not_blank":        "Bitte einen Camptermin auswählen.",
    "chk_jersey_size_allowed":        "Ungültige Trikotnummer.",
    "chk_consent_given":              "Datenschutzerklärung muss akzeptiert werden.",
}

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False)


def verify_session_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Prüft das JWT-Session-Token aus dem Authorization-Header."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nicht authentifiziert.",
        )
    try:
        jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sitzung abgelaufen. Bitte neu anmelden.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültige Sitzung.",
        )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post(
    "/admin/login",
    tags=["Admin"],
    summary="Admin-Login – gibt ein zeitlich begrenztes Session-Token zurück",
)
def admin_login(payload: AdminLoginIn) -> dict:
    """
    Prüft das Admin-Passwort mit timing-sicherem Vergleich.
    Gibt bei Erfolg ein signiertes JWT zurück, das TOKEN_EXPIRE_HOURS gültig ist.
    Fehlermeldungen geben keine Hinweise auf gültige Passwörter.
    """
    if not secrets.compare_digest(payload.password.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Anmeldung fehlgeschlagen.",
        )
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "admin",
            "iat": now,
            "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token, "expires_in_hours": TOKEN_EXPIRE_HOURS}


@app.get("/health", tags=["System"])
def health() -> dict:
    """Gibt den DB-Status zurück."""
    try:
        with db_cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok", "database": "reachable"}
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "database": str(exc)},
        )


@app.post(
    "/registrations",
    status_code=status.HTTP_201_CREATED,
    response_model=RegistrationOut,
    tags=["Registrations"],
    summary="Neue Anmeldung einreichen (öffentlich)",
)
def create_registration(payload: RegistrationIn) -> dict:
    """
    Speichert eine neue Camp-Anmeldung.

    Verwendet parameterisierte Queries — keine SQL-Injection möglich.
    Gibt den vollständig gespeicherten Datensatz zurück.
    """
    sql = """
        INSERT INTO camp_registrations (
            child_first_name, child_last_name, birth_date,
            parent_name, email, phone,
            selected_camp_week, jersey_size,
            allergies, notes, consent_privacy
        ) VALUES (
            %(child_first_name)s, %(child_last_name)s, %(birth_date)s,
            %(parent_name)s, %(email)s, %(phone)s,
            %(selected_camp_week)s, %(jersey_size)s,
            %(allergies)s, %(notes)s, %(consent_privacy)s
        )
        RETURNING *
    """
    try:
        with db_cursor() as cur:
            cur.execute(sql, payload.model_dump())
            row = cur.fetchone()
    except psycopg2.errors.CheckViolation as exc:
        name = exc.diag.constraint_name or ""
        msg = CONSTRAINT_MESSAGES.get(name, f"Ungültige Eingabe ({name}).")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=msg,
        )
    except psycopg2.pool.PoolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Keine freie Datenbankverbindung: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Anmeldung konnte nicht gespeichert werden: {exc}",
        )

    return serialize(dict(row))


@app.get(
    "/registrations",
    response_model=list[RegistrationOut],
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Alle Anmeldungen abrufen (Admin)",
)
def list_registrations() -> list[dict]:
    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations ORDER BY created_at DESC")
            rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")
    return [serialize(dict(row)) for row in rows]


@app.get(
    "/registrations/export/csv",
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Alle Anmeldungen als CSV exportieren (Admin)",
)
def export_registrations_csv() -> StreamingResponse:
    """
    Gibt alle Anmeldungen als UTF-8-CSV mit BOM zurück
    (BOM sorgt dafür, dass Excel Umlaute korrekt anzeigt).
    Nur für Admins zugänglich.
    """
    CSV_COLUMNS = [
        "id", "created_at",
        "child_first_name", "child_last_name", "birth_date",
        "parent_name", "email", "phone",
        "selected_camp_week", "jersey_size",
        "allergies", "notes",
        "consent_privacy", "status", "payment_status",
    ]
    CSV_HEADERS = [
        "ID", "Anmeldedatum",
        "Vorname Kind", "Nachname Kind", "Geburtsdatum",
        "Elternteil", "E-Mail", "Telefon",
        "Termin", "Trikotnummer",
        "Allergien", "Notizen",
        "Datenschutz", "Status", "Zahlungsstatus",
    ]

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations ORDER BY created_at DESC")
            rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")

    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM für Excel-Kompatibilität
    writer = csv.DictWriter(
        output,
        fieldnames=CSV_COLUMNS,
        extrasaction="ignore",
        delimiter=";",  # Semikolon ist Standard in deutschen Excel-Versionen
    )
    # Eigene Kopfzeile mit deutschen Labels
    writer.writerow(dict(zip(CSV_COLUMNS, CSV_HEADERS)))
    for row in rows:
        writer.writerow(serialize(dict(row)))

    filename = f"anmeldungen-{__import__('datetime').date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get(
    "/registrations/{registration_id}",
    response_model=RegistrationOut,
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Einzelne Anmeldung abrufen (Admin)",
)
def get_registration(registration_id: str) -> dict:
    try:
        uid = uuid.UUID(registration_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ungültiges UUID-Format.")

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM camp_registrations WHERE id = %s", (str(uid),))
            row = cur.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Anmeldung {registration_id} nicht gefunden.")

    return serialize(dict(row))


@app.delete(
    "/registrations/{registration_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_session_token)],
    tags=["Registrations"],
    summary="Anmeldung löschen (Admin)",
)
def delete_registration(registration_id: str) -> dict:
    try:
        uid = uuid.UUID(registration_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ungültiges UUID-Format.")

    try:
        with db_cursor() as cur:
            cur.execute("DELETE FROM camp_registrations WHERE id = %s RETURNING id", (str(uid),))
            deleted = cur.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Datenbankfehler: {exc}")

    if deleted is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Anmeldung {registration_id} nicht gefunden.")

    return {"message": "Anmeldung gelöscht.", "id": str(deleted["id"])}
