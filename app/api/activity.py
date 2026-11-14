"""What happened to each of your documents, for the shelf in the web app."""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.chat_message import ChatMessage
from app.models.document import Document
from app.models.user import User
from app.models.video_job import VideoJob

router = APIRouter()

MAX_ITEMS = 100


@router.get("")
def activity(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Your documents with their question and story counts, latest activity first."""
    documents = db.query(Document).filter(Document.user_id == current_user.id).all()

    messages = {
        document_id: (count, latest)
        for document_id, count, latest in db.query(
            ChatMessage.document_id, func.count(ChatMessage.id), func.max(ChatMessage.created_at)
        )
        .filter(ChatMessage.user_id == current_user.id)
        .group_by(ChatMessage.document_id)
    }
    stories = {
        document_id: (count, latest)
        for document_id, count, latest in db.query(
            VideoJob.document_id, func.count(VideoJob.id), func.max(VideoJob.created_at)
        )
        .filter(VideoJob.user_id == current_user.id)
        .group_by(VideoJob.document_id)
    }
    latest_message = (
        db.query(ChatMessage.document_id, func.max(ChatMessage.created_at).label("at"))
        .filter(ChatMessage.user_id == current_user.id)
        .group_by(ChatMessage.document_id)
        .subquery()
    )
    last_questions = dict(
        db.query(ChatMessage.document_id, ChatMessage.question).join(
            latest_message,
            and_(
                ChatMessage.document_id == latest_message.c.document_id,
                ChatMessage.created_at == latest_message.c.at,
            ),
        )
    )

    items = []
    for document in documents:
        message_count, message_at = messages.get(document.id, (0, None))
        story_count, story_at = stories.get(document.id, (0, None))
        moments = [moment for moment in (document.upload_date, message_at, story_at) if moment]
        items.append(
            {
                "id": document.id,
                "filename": document.filename,
                "status": document.status,
                "page_count": document.page_count,
                "upload_date": document.upload_date,
                "last_activity_at": max(moments) if moments else None,
                "message_count": message_count,
                "story_count": story_count,
                "last_question": last_questions.get(document.id),
            }
        )
    items.sort(key=lambda item: item["last_activity_at"] or datetime.min, reverse=True)
    return {"documents": items[:MAX_ITEMS]}
