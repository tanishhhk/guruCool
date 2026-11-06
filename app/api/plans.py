"""The plans on offer. Public: the web app shows them before and after sign-in."""
from fastapi import APIRouter

from app.services import plans

router = APIRouter()


@router.get("")
def list_plans():
    return [
        {
            "id": plan.id,
            "label": plan.label,
            "daily": plan.daily,
            "max_documents": plan.max_documents,
            "story_depths": list(plan.story_depths),
            "price_note": plan.price_note,
        }
        for plan in plans.all_plans().values()
    ]
