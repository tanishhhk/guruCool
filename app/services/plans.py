"""What each plan allows. Everyone is on Free until payments exist; Plus and Pro are shown as coming soon.

Free takes its numbers from settings (DAILY_*_PER_USER, MAX_DOCUMENTS_PER_USER), so a
deployment can tune them. A plan is set on users.plan.
"""
from dataclasses import dataclass

from app.config import settings

# Video credits a story costs, by length.
STORY_COST = {"overview": 1, "detailed": 2, "deep": 3}
DEPTH_NAMES = {"overview": "Short", "detailed": "Detailed", "deep": "Deep dive"}


@dataclass(frozen=True)
class Plan:
    id: str
    label: str
    daily: dict
    max_documents: int
    story_depths: tuple
    price_note: str


def all_plans() -> dict[str, Plan]:
    return {
        "free": Plan(
            "free",
            "Free",
            {
                "upload": settings.daily_uploads_per_user,
                "question": settings.daily_questions_per_user,
                "story": settings.daily_stories_per_user,
            },
            settings.max_documents_per_user,
            ("overview", "detailed"),
            "Free",
        ),
        "plus": Plan(
            "plus", "Plus", {"upload": 20, "question": 100, "story": 10}, 100,
            ("overview", "detailed", "deep"), "Coming soon",
        ),
        "pro": Plan(
            "pro", "Pro", {"upload": 50, "question": 300, "story": 30}, 500,
            ("overview", "detailed", "deep"), "Coming soon",
        ),
    }


def plan_for(user) -> Plan:
    """The user's plan. A bare user id (older callers) means Free."""
    plans = all_plans()
    plan_id = getattr(user, "plan", None) or "free"
    return plans.get(plan_id, plans["free"])


def first_plan_with(depth: str) -> Plan:
    return next(plan for plan in all_plans().values() if depth in plan.story_depths)
