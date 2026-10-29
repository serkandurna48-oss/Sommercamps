"""Minimal stand-in for Supabase Auth (GoTrue) for local browser E2E only.

Listens on 127.0.0.1 only. Implements just the calls CampsPilot makes:
admin user create/delete/lookup, generate_link (signup), verify, password and
refresh-token grants, /user, logout, recover. Every "mail" Supabase or the API
would trigger is recorded in an in-memory outbox (GET /__outbox?email=...).
Not a security boundary - never run outside a test machine.

    python scripts/e2e/fake_gotrue.py 59999 owner@e2e.example:<owner-password>:<owner-uuid>

Env E2E_DB_PORT (default 55443): new users are mirrored into auth.users of the
local e2e_campspilot database, like real Supabase does (FKs point there).
"""
from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlencode, urlsplit

LOCK = threading.Lock()
USERS: dict[str, dict] = {}      # email -> {id, email, password, confirmed}
TOKENS: dict[str, str] = {}      # access/refresh token -> email
VERIFY: dict[str, tuple[str, str]] = {}  # verify token -> (email, redirect_to)
OUTBOX: list[dict] = []
PORT = 59999


def _mirror_auth_user(user_id: str, delete: bool = False) -> None:
    import psycopg2

    with psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("E2E_DB_PORT", "55443")),
                          user="postgres", dbname="e2e_campspilot", connect_timeout=5) as conn:
        with conn.cursor() as cur:
            if delete:
                cur.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))
            else:
                cur.execute("INSERT INTO auth.users (id) VALUES (%s) ON CONFLICT DO NOTHING", (user_id,))


def _jwt(sub: str, email: str, ttl: int = 3600) -> str:
    def b64(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    exp = int(time.time()) + ttl
    return f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64({'sub': sub, 'email': email, 'exp': exp, 'aud': 'authenticated', 'role': 'authenticated', 'jti': uuid.uuid4().hex})}.e2e"


def _user_json(u: dict) -> dict:
    return {"id": u["id"], "aud": "authenticated", "role": "authenticated", "email": u["email"],
            "email_confirmed_at": "2026-01-01T00:00:00Z" if u["confirmed"] else None,
            "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}


def _session(u: dict) -> dict:
    access = _jwt(u["id"], u["email"])
    refresh = uuid.uuid4().hex
    TOKENS[access] = u["email"]
    TOKENS[refresh] = u["email"]
    return {"access_token": access, "token_type": "bearer", "expires_in": 3600,
            "expires_at": int(time.time()) + 3600, "refresh_token": refresh, "user": _user_json(u)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def _send(self, status: int, body: object | None = None, headers: dict | None = None) -> None:
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}") if length else {}

    def _bearer_user(self) -> dict | None:
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        email = TOKENS.get(token)
        return USERS.get(email) if email else None

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        url = urlsplit(self.path)
        q = parse_qs(url.query)
        with LOCK:
            if url.path == "/__outbox":
                email = (q.get("email") or [""])[0].lower()
                self._send(200, [m for m in OUTBOX if not email or m["to"] == email])
            elif url.path == "/auth/v1/user":
                u = self._bearer_user()
                self._send(200, _user_json(u)) if u else self._send(401, {"msg": "invalid token"})
            elif url.path == "/auth/v1/admin/users":
                email = (q.get("email") or [""])[0].lower()
                users = [_user_json(u) for u in USERS.values() if not email or u["email"] == email]
                self._send(200, {"users": users})
            elif url.path == "/auth/v1/verify":
                token = (q.get("token") or [""])[0]
                entry = VERIFY.pop(token, None)
                if not entry:
                    self._send(303, None, {"Location": "about:blank#error=access_denied"})
                    return
                email, redirect_to = entry
                USERS[email]["confirmed"] = True
                s = _session(USERS[email])
                frag = urlencode({"access_token": s["access_token"], "refresh_token": s["refresh_token"],
                                  "expires_in": 3600, "token_type": "bearer", "type": "signup"})
                self._send(303, None, {"Location": f"{redirect_to}#{frag}"})
            else:
                self._send(404, {"msg": "not found"})

    def do_POST(self):
        url = urlsplit(self.path)
        q = parse_qs(url.query)
        body = self._body()
        with LOCK:
            if url.path == "/auth/v1/admin/users":
                email = body["email"].lower()
                if email in USERS:
                    self._send(422, {"msg": "A user with this email address has already been registered"})
                    return
                USERS[email] = {"id": str(uuid.uuid4()), "email": email, "password": body["password"],
                                "confirmed": bool(body.get("email_confirm"))}
                _mirror_auth_user(USERS[email]["id"])
                self._send(200, _user_json(USERS[email]))
            elif url.path == "/auth/v1/admin/generate_link":
                email = body["email"].lower()
                redirect_to = (q.get("redirect_to") or [body.get("redirect_to", "")])[0]
                token = uuid.uuid4().hex
                VERIFY[token] = (email, redirect_to)
                link = f"http://127.0.0.1:{PORT}/auth/v1/verify?token={token}&type=signup&redirect_to={quote(redirect_to)}"
                OUTBOX.append({"to": email, "kind": "signup_link", "link": link})
                self._send(200, {"action_link": link, "email": email})
            elif url.path == "/auth/v1/token":
                grant = (q.get("grant_type") or [""])[0]
                if grant == "password":
                    u = USERS.get(body.get("email", "").lower())
                    if not u or u["password"] != body.get("password"):
                        self._send(400, {"error": "invalid_grant", "error_description": "Invalid login credentials"})
                    elif not u["confirmed"]:
                        self._send(400, {"error": "invalid_grant", "error_code": "email_not_confirmed",
                                         "error_description": "Email not confirmed"})
                    else:
                        self._send(200, _session(u))
                elif grant == "refresh_token":
                    email = TOKENS.pop(body.get("refresh_token", ""), None)
                    if not email:
                        self._send(400, {"error": "invalid_grant", "error_code": "refresh_token_not_found"})
                    else:
                        self._send(200, _session(USERS[email]))
                else:
                    self._send(400, {"error": "unsupported_grant_type"})
            elif url.path == "/auth/v1/recover":
                email = body.get("email", "").lower()
                OUTBOX.append({"to": email, "kind": "recovery", "redirect_to": (q.get("redirect_to") or [""])[0]})
                self._send(200, {})
            elif url.path == "/auth/v1/logout":
                self._send(204)
            else:
                self._send(404, {"msg": "not found"})

    def do_PUT(self):
        url = urlsplit(self.path)
        body = self._body()
        with LOCK:
            u = self._bearer_user()
            if url.path == "/auth/v1/user" and u:
                if "password" in body:
                    u["password"] = body["password"]
                self._send(200, _user_json(u))
            else:
                self._send(401, {"msg": "invalid token"})

    def do_DELETE(self):
        url = urlsplit(self.path)
        with LOCK:
            if url.path.startswith("/auth/v1/admin/users/"):
                uid = url.path.rsplit("/", 1)[1]
                for email, u in list(USERS.items()):
                    if u["id"] == uid:
                        del USERS[email]
                _mirror_auth_user(uid, delete=True)
                self._send(200, {})
            else:
                self._send(404, {"msg": "not found"})


def main() -> None:
    global PORT
    PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 59999
    for spec in sys.argv[2:]:
        email, password, uid = spec.split(":", 2)
        USERS[email.lower()] = {"id": uid, "email": email.lower(), "password": password, "confirmed": True}
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
