"""Issue and check the 6-digit codes sent by email.

Codes are stored as an HMAC keyed with the app secret, live 15 minutes, allow
5 wrong tries, and a new one cannot be sent within a minute of the last.
"""
import hashlib
import hmac
import secrets
import time
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.email_code import EmailCode

LIFETIME_SECONDS = 15 * 60
RESEND_SECONDS = 60
MAX_ATTEMPTS = 5
PURPOSES = ("verify", "reset")


def _hash(user_id: str, purpose: str, code: str) -> str:
    message = f"{user_id}:{purpose}:{code}".encode()
    return hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()


def issue_code(db: Session, user, purpose: str) -> str | None:
    """A new code for this user and purpose, or None when one was sent under a minute ago."""
    now = int(time.time())
    latest = (
        db.query(EmailCode)
        .filter(EmailCode.user_id == user.id, EmailCode.purpose == purpose)
        .order_by(EmailCode.created_at.desc())
        .first()
    )
    if latest is not None and now - latest.created_at < RESEND_SECONDS:
        return None
    db.query(EmailCode).filter(EmailCode.user_id == user.id, EmailCode.purpose == purpose).delete(
        synchronize_session=False
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailCode(
            id=str(uuid.uuid4()),
            user_id=user.id,
            purpose=purpose,
            code_hash=_hash(user.id, purpose, code),
            expires_at=now + LIFETIME_SECONDS,
            attempts=0,
            created_at=now,
        )
    )
    db.commit()
    return code


def check_code(db: Session, user, purpose: str, code: str) -> bool:
    """True once for the right, unexpired code. Each wrong try counts; the fifth kills the code."""
    stored = (
        db.query(EmailCode)
        .filter(EmailCode.user_id == user.id, EmailCode.purpose == purpose)
        .order_by(EmailCode.created_at.desc())
        .first()
    )
    if stored is None or stored.expires_at < int(time.time()) or stored.attempts >= MAX_ATTEMPTS:
        return False
    if hmac.compare_digest(stored.code_hash, _hash(user.id, purpose, code.strip())):
        db.delete(stored)
        db.commit()
        return True
    stored.attempts += 1
    db.commit()
    return False
