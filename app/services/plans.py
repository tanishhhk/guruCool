"""What each plan allows. Everyone is on Free until payments exist; Plus and Pro are shown as coming soon.

Free takes its numbers from settings (DAILY_*_PER_USER, MAX_DOCUMENTS_PER_USER), so a
deployment can tune them. A plan is set on users.plan.
"""
from dataclasses import dataclass, replace

from app.config import settings

# Video credits a story costs, by length.
STORY_COST = {"overview": 1, "detailed": 2, "deep": 3}
DEPTH_NAMES = {"overview": "Short", "detailed": "Detailed", "deep": "Deep dive"}

# "Just exploring" on Free: smaller daily limits and no videos. Choosing a purpose
# (exam prep, research, teaching or a work field) lifts both.
EXPLORE_FOCUS = "explore"
EXPLORE_DAILY = {"upload": 2, "question": 10, "story": 0}
EXPLORE_MAX_DOCUMENTS = 5
EXPLORE_NOTE = "Just exploring: no videos"


@dataclass(frozen=True)
class Plan:
    id: str
    label: str
    daily: dict
    max_documents: int
    story_depths: tuple
    price_note: str
    note: str | None = None


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
    """The user's plan. A bare user id (older callers) means Free.

    Free users who chose "Just exploring" get the explorer limits and no videos.
    """
    plans = all_plans()
    plan_id = getattr(user, "plan", None) or "free"
    plan = plans.get(plan_id, plans["free"])
    if plan.id == "free" and getattr(user, "focus", None) == EXPLORE_FOCUS:
        return replace(
            plan,
            daily=dict(EXPLORE_DAILY),
            max_documents=EXPLORE_MAX_DOCUMENTS,
            story_depths=(),
            note=EXPLORE_NOTE,
        )
    return plan


def first_plan_with(depth: str) -> Plan:
    return next(plan for plan in all_plans().values() if depth in plan.story_depths)
