"""Shared, non-personal bank transfer reference for the selected camp."""

from uuid import UUID


def payment_reference(camp_title: str, registration_token: UUID) -> str:
    token_ref = f"CP-{str(registration_token)[:8].upper()}"
    title = " ".join(camp_title.split())
    return f"{title[:140 - len(token_ref) - 1]} {token_ref}" if title else token_ref
