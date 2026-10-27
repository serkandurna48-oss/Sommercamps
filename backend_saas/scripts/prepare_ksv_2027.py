"""Prepare five KSV 2027 camp drafts offline. No API, DB, mail or payment access.

Default is dry-run. --write-plan writes only a local JSON review artifact; it
does not publish camps. Required commercial details remain explicit gates.
"""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path


ORG_SLUG = "ksv-baunatal"
CAMPS = (
    ("ksv-winter-fussballschule-2027", "Winter-Fußballschule 2027", "2027-01-04", "2027-01-07"),
    ("ksv-oster-fussballschule-2027", "Oster-Fußballschule 2027", "2027-03-22", "2027-03-25"),
    ("ksv-sommer-1-fussballschule-2027", "1. Sommer-Fußballschule 2027", "2027-06-28", "2027-07-01"),
    ("ksv-sommer-2-fussballschule-2027", "2. Sommer-Fußballschule 2027", "2027-08-02", "2027-08-05"),
    ("ksv-herbst-fussballschule-2027", "Herbst-Fußballschule 2027", "2027-10-04", "2027-10-07"),
)


def proposed_camps(capacity: int = 70) -> list[dict]:
    if capacity <= 0:
        raise ValueError("capacity must be positive")
    return [
        {
            "slug": slug,
            "title": title,
            "start_date": date.fromisoformat(start).isoformat(),
            "end_date": date.fromisoformat(end).isoformat(),
            "capacity": capacity,
            "status": "draft",
            # CampCreate requires these; an unknown 2027 price must never be
            # silently copied from the historical 2026 example seed.
            "price_cents": None,
            "age_min": None,
            "age_max": None,
            "registration_start": None,
            "registration_end": None,
        }
        for slug, title, start, end in CAMPS
    ]


def prepare(existing: dict | None = None, capacity: int = 70) -> dict:
    """Check a synthetic snapshot; never update pre-existing rows."""
    if existing is not None and existing.get("organization_slug") != ORG_SLUG:
        raise ValueError("snapshot organization must be ksv-baunatal")
    camps = proposed_camps(capacity)
    old = {camp["slug"]: camp for camp in (existing or {}).get("camps", [])}
    if len(old) != len((existing or {}).get("camps", [])):
        raise ValueError("duplicate existing slug")
    pending = []
    already = []
    for camp in camps:
        previous = old.get(camp["slug"])
        if previous is None:
            pending.append(camp)
        elif all(previous.get(k) == v for k, v in camp.items() if k not in ("price_cents", "age_min", "age_max", "registration_start", "registration_end")):
            already.append(camp["slug"])
        else:
            raise ValueError(f"existing camp conflicts: {camp['slug']}")
    return {
        "organization_slug": ORG_SLUG,
        "drafts": pending,
        "already_present": already,
        "release_gates": [
            "2027 price_cents per camp verified by KSV",
            "2027 age_min and age_max verified by KSV (historical 5–12 is a template only)",
            "registration opening/closing times confirmed with timezone",
            "bank details verified from approved operator configuration",
            "retention periods and publication separately approved",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capacity", type=int, default=70)
    parser.add_argument("--existing", type=Path, help="local synthetic snapshot JSON")
    parser.add_argument("--write-plan", type=Path, help="write local JSON review artifact")
    args = parser.parse_args(argv)
    try:
        snapshot = json.loads(args.existing.read_text(encoding="utf-8")) if args.existing else None
        plan = prepare(snapshot, args.capacity)
        output = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
        if args.write_plan:
            args.write_plan.write_text(output, encoding="utf-8")
            print(f"[LOCAL PLAN] {args.write_plan}")
        else:
            print("[DRY-RUN] No file or database changed")
            print(output, end="")
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
