"""Send verification and reset codes by email.

Brevo is used over HTTPS because free hosts such as Render block outgoing SMTP.
The console provider only logs the code, for local development.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"

_SUBJECTS = {
    "verify": "Your guruKool code",
    "reset": "Reset your guruKool password",
}
_LINES = {
    "verify": "Here is your code to finish setting up guruKool.",
    "reset": "Here is your code to choose a new guruKool password.",
}


def _bodies(code: str, purpose: str) -> tuple[str, str]:
    line = _LINES[purpose]
    text = f"{line}\n\n{code}\n\nIt works for 15 minutes. If you did not ask for it, you can ignore this email."
    html = (
        '<div style="font-family:Arial,sans-serif;color:#0e2229;max-width:480px">'
        f"<p>{line}</p>"
        '<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">'
        f'<span style="background:#ffc94d;padding:4px 12px;border-radius:6px">{code}</span></p>'
        "<p>It works for 15 minutes. If you did not ask for it, you can ignore this email.</p>"
        '<p style="color:#55666c">guruKool</p></div>'
    )
    return text, html


def send_code(email: str, code: str, purpose: str) -> None:
    """Send a code. Failures are logged, not raised: the person can ask for another code."""
    if settings.email_provider == "console":
        logger.warning("Email code (console provider).", extra={"purpose": purpose, "code": code})
        return
    if settings.email_provider != "brevo":
        return
    text, html = _bodies(code, purpose)
    try:
        response = httpx.post(
            BREVO_URL,
            headers={"api-key": settings.brevo_api_key, "accept": "application/json"},
            json={
                "sender": {"name": settings.email_from_name, "email": settings.email_from_address},
                "to": [{"email": email}],
                "subject": _SUBJECTS[purpose],
                "textContent": text,
                "htmlContent": html,
            },
            timeout=10,
        )
        if response.status_code >= 300:
            logger.warning("Email was not accepted.", extra={"status_code": response.status_code})
    except httpx.HTTPError:
        logger.warning("Email could not be sent.")
