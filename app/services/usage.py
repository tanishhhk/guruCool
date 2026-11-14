"""Daily per-user limits on uploads, questions and stories.

Free model tiers have small shared daily quotas, so each user gets a fair
share. Counters reset at midnight UTC. An increment only succeeds below the
limit, in one UPDATE, so concurrent requests cannot overshoot it.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.usage import UsageCounter
from app.services.plans import plan_for

KINDS = ("upload", "question", "story")
_NOUNS = {"upload": "uploads", "question": "questions", "story": "video credits"}


def limits(user=None) -> dict[str, int]:
    """Today's limits for this user's plan (Free when no user is given)."""
    return dict(plan_for(user).daily)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> str:
    return _now().strftime("%Y-%m-%d")


def seconds_until_reset() -> int:
    now = _now()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - now).total_seconds()))


def used_today(db: Session, user_id: str) -> dict[str, int]:
    rows = db.query(UsageCounter.kind, UsageCounter.count).filter(
        UsageCounter.user_id == user_id, UsageCounter.day == _today()
    )
    used = dict.fromkeys(KINDS, 0)
    used.update({kind: count for kind, count in rows})
    return used


def consume(db: Session, user, kind: str, amount: int = 1) -> None:
    """Spend amount of today's allowance, or raise 429 if it does not fit. The caller commits.

    user is a User, or a user id for the Free plan.
    """
    user_id = user if isinstance(user, str) else user.id
    limit, day = limits(user)[kind], _today()
    for _ in range(2):
        incremented = (
            db.query(UsageCounter)
            .filter(
                UsageCounter.user_id == user_id,
                UsageCounter.day == day,
                UsageCounter.kind == kind,
                UsageCounter.count <= limit - amount,
            )
            .update({UsageCounter.count: UsageCounter.count + amount}, synchronize_session=False)
        )
        if incremented:
            return
        exists = (
            db.query(UsageCounter.id)
            .filter(UsageCounter.user_id == user_id, UsageCounter.day == day, UsageCounter.kind == kind)
            .first()
        )
        if exists or limit < amount:
            break
        try:
            with db.begin_nested():
                db.add(UsageCounter(user_id=user_id, day=day, kind=kind, count=amount))
            return
        except IntegrityError:
            continue  # Another request created today's row first; increment it instead.
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            f"You have used today's {limit} {_NOUNS[kind]}. The limit resets at midnight UTC."
            if amount == 1
            else f"That needs {amount} video credits and fewer are left today. They reset at midnight UTC."
        ),
        headers={"Retry-After": str(seconds_until_reset())},
    )
