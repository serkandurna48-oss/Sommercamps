"""
KSV Baunatal – Zusatzfragen einrichten (CP-KV1).

Pflichtschalter:
  --dry-run (Standard): Zeigt, was gesetzt würde, ohne zu schreiben.
  --apply:              Schreibt tatsächlich, erfordert --dry-run=false.

Verweigert Ausführung, wenn GET /health nicht 'service: campspilot-saas-api' meldet.
"""

import argparse
import json
import sys
import urllib.request


KSV_QUESTIONS = [
    {
        "key": "position",
        "label": "Position",
        "type": "choice",
        "options": ["Feldspieler", "Torwart"],
        "other_label": None,
        "required": True,
    },
    {
        "key": "verein",
        "label": "Verein",
        "type": "choice",
        "options": ["KSV Baunatal"],
        "other_label": "Anderer Verein",
        "required": True,
    },
]


def check_health(base_url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{base_url}/health", timeout=10) as resp:
            body = json.load(resp)
            return body.get("service") == "campspilot-saas-api"
    except Exception as exc:
        print(f"[ERROR] Health-Check fehlgeschlagen: {exc}", file=sys.stderr)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--org-slug", default="ksv-baunatal")
    parser.add_argument("--token", help="Admin-Bearer-Token")
    parser.add_argument("--apply", action="store_true", help="Tatsächlich schreiben (sonst dry-run)")
    args = parser.parse_args()

    print(f"[INFO] Ziel: {args.base_url}  Verein: {args.org_slug}")
    print("[INFO] Geplante Fragen:")
    for q in KSV_QUESTIONS:
        print(f"  - {q['key']} ({q['type']}): {q['label']}")
        if q.get('options'):
            print(f"    Optionen: {q['options']}")
        if q.get('other_label'):
            print(f"    Sonstiges-Label: {q['other_label']}")

    if not check_health(args.base_url):
        print("[ERROR] Health-Check: Service ist nicht campspilot-saas-api. Abbruch.", file=sys.stderr)
        sys.exit(1)

    if not args.apply:
        print("[DRY-RUN] Keine Änderungen geschrieben. Mit --apply ausführen.")
        return

    if not args.token:
        print("[ERROR] --token ist für --apply erforderlich.", file=sys.stderr)
        sys.exit(1)

    payload = json.dumps({"registration_questions": KSV_QUESTIONS}).encode()
    req = urllib.request.Request(
        f"{args.base_url}/admin/organizations/{args.org_slug}",
        data=payload,
        method="PATCH",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {args.token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.load(resp)
            print(f"[OK] Fragen gesetzt. Antwort: {json.dumps(body.get('registration_questions', []), ensure_ascii=False)}")
    except urllib.error.HTTPError as exc:
        print(f"[ERROR] HTTP {exc.code}: {exc.read().decode()}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
