import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.config import settings
from app.database import get_db
from app.models.chat_message import ChatMessage
from app.models.document import Document
from app.models.user import User
from app.services import ingestion, usage
from app.services.embeddings import generate_single_embedding
from app.services.llm import (
    NOT_FOUND_ANSWER,
    AnswerServiceError,
    extractive_answer,
    cited_source_ids,
    generate_answer,
)
from app.services.retrieval import retrieve

logger = logging.getLogger(__name__)
router = APIRouter()


# Status, message and default Retry-After for each AnswerServiceError kind.
_ANSWER_SERVICE_ERRORS = {
    "timeout": (
        status.HTTP_504_GATEWAY_TIMEOUT,
        "The answer service took too long to respond. Try again.",
        5,
    ),
    "busy": (
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "The answer service is busy or has reached its usage limit. Try again later.",
        30,
    ),
    "unavailable": (
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "The answer service is temporarily unavailable. Try again shortly.",
        10,
    ),
    "misconfigured": (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "The answer service is not configured correctly. Contact the administrator.",
        None,
    ),
    "rejected": (
        status.HTTP_502_BAD_GATEWAY,
        "The answer service could not answer this question. Try rephrasing it.",
        None,
    ),
    "empty": (
        status.HTTP_502_BAD_GATEWAY,
        "The answer service returned an empty answer. Try rephrasing the question.",
        None,
    ),
}


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    document_id: str = Field(min_length=1, max_length=128)
    top_k: int = Field(default=3, ge=1, le=10)


# Earlier turns given to the model so follow-up questions make sense.
HISTORY_TURNS = 2


def _owned_document(db: Session, document_id: str, user_id: str) -> Document:
    document = None
    if "\x00" not in document_id:  # PostgreSQL cannot compare text with NUL bytes.
        document = (
            db.query(Document)
            .filter(Document.id == document_id, Document.user_id == user_id)
            .first()
        )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


def _recent_turns(db: Session, document_id: str) -> list[tuple[str, str]]:
    rows = (
        db.query(ChatMessage.question, ChatMessage.answer)
        .filter(ChatMessage.document_id == document_id, ChatMessage.answer_status != "extractive")
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_TURNS)
        .all()
    )
    return [(question, answer) for question, answer in reversed(rows)]


def _message_view(message: ChatMessage) -> dict:
    return {
        "id": message.id,
        "question": message.question,
        "answer": message.answer,
        "answer_status": message.answer_status,
        "sources": json.loads(message.sources),
        "created_at": message.created_at,
    }


@router.post("/ask")
def ask_question(
    request: QuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Answer a question from one of your documents, and save it to that document's chat."""
    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question cannot be blank.",
        )

    document = _owned_document(db, request.document_id, current_user.id)
    if document.status in (ingestion.QUEUED, ingestion.PROCESSING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document is still being processed. Try again shortly.",
        )
    if document.status == ingestion.FAILED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Processing failed for this document, so it cannot be searched. "
            "Retry processing or upload it again.",
        )

    usage.consume(db, current_user, "question")
    db.commit()
    result = retrieve(db, document.id, generate_single_embedding(question), request.top_k, question)
    if not result.chunks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document has no usable indexed text. Retry processing to index it again.",
        )

    fallback_reason = None
    try:
        generated = generate_answer(
            question, result.chunks, current_user.focus, history=_recent_turns(db, document.id)
        )
    except AnswerServiceError as exc:
        logger.warning("Answer generation failed.", extra={"kind": exc.kind})
        if settings.answer_fallback != "extractive":
            status_code, detail, default_retry = _ANSWER_SERVICE_ERRORS[exc.kind]
            retry_after = exc.retry_after or default_retry
            raise HTTPException(
                status_code=status_code,
                detail=detail,
                headers={"Retry-After": str(max(1, round(retry_after)))} if retry_after else None,
            ) from exc
        generated = None
        fallback_reason = exc.kind

    if generated is None:
        answer, cited = extractive_answer(result.chunks)
        answer_status = "extractive"
    else:
        answer, cited = cited_source_ids(generated.text, result.chunks)
        found = bool(cited) or NOT_FOUND_ANSWER.lower() not in answer.lower()
        answer_status = "answered" if found else "not_found"
    sources = [
        {
            "source_id": chunk.source_id,
            "chunk_index": chunk.chunk_index,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "similarity_score": round(chunk.score, 6),
            "preview": chunk.text[:360],
            "cited": chunk.source_id in cited,
        }
        for chunk in result.chunks
    ]
    message = ChatMessage(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        document_id=document.id,
        question=question,
        answer=answer,
        answer_status=answer_status,
        sources=json.dumps(sources),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(message)
    db.commit()
    return {
        "message_id": message.id,
        "created_at": message.created_at,
        "answer": answer,
        "answer_status": answer_status,
        "document_id": document.id,
        "document_name": document.filename,
        "sources": sources,
        "metadata": {
            "chunks_searched": result.searched,
            "chunks_skipped": result.skipped,
            "top_k_used": len(result.chunks),
            "provider": generated.provider if generated else None,
            "model": generated.model if generated else None,
            "fallback_reason": fallback_reason,
        },
    }


@router.get("/history/{document_id}")
def chat_history(
    document_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The latest questions and answers for one of your documents, oldest first."""
    document = _owned_document(db, document_id, current_user.id)
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.document_id == document.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"messages": [_message_view(row) for row in reversed(rows)]}


@router.delete("/history/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear the chat of one of your documents."""
    document = _owned_document(db, document_id, current_user.id)
    db.query(ChatMessage).filter(ChatMessage.document_id == document.id).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
