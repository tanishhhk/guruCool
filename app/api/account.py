"""Your account: details, password, signing out everywhere, and deleting it all."""
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.chat_message import ChatMessage
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.upload_idempotency import UploadIdempotency
from app.models.usage import UsageCounter
from app.models.user import User
from app.models.video_job import VideoJob
from app.schemas.account import AccountDeletion, AccountResponse, NameUpdate, PasswordChange
from app.services import video_jobs
from app.services.auth import get_password_hash, issue_token, verify_password

logger = logging.getLogger(__name__)
router = APIRouter()


def account_view(user: User) -> dict:
    methods = ["password"] if user.hashed_password else []
    return {
        "id": user.id,
        "email": user.email,
        "email_verified": bool(user.email_verified),
        "display_name": user.display_name,
        "phone": getattr(user, "phone", None),
        "has_password": bool(user.hashed_password),
        "sign_in_methods": methods,
        "profession": user.profession,
        "focus": user.focus,
        "plan": user.plan or "free",
        "created_at": user.created_at,
        "story_preferences": {},
    }


def _check_password(user: User, password: str | None) -> None:
    if user.hashed_password and not (password and verify_password(password, user.hashed_password)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That password is not right.")


def _new_session(db: Session, user: User) -> dict:
    """Sign out every device by moving to a new token version, and return a token for this one."""
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    db.refresh(user)
    return {"access_token": issue_token(user), "token_type": "bearer"}


@router.get("", response_model=AccountResponse)
def get_account(current_user: User = Depends(get_current_user)):
    return account_view(current_user)


@router.patch("", response_model=AccountResponse)
def rename(body: NameUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.display_name = body.display_name
    db.commit()
    db.refresh(current_user)
    return account_view(current_user)


@router.post("/password")
def change_password(body: PasswordChange, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change (or, for accounts without one, set) the password. Signs out other devices."""
    _check_password(current_user, body.current_password)
    current_user.hashed_password = get_password_hash(body.new_password)
    return _new_session(db, current_user)


@router.post("/sign-out-everywhere")
def sign_out_everywhere(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _new_session(db, current_user)


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(body: AccountDeletion, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete the account with every document, chat, video and file that belongs to it."""
    _check_password(current_user, body.password)
    user_id = current_user.id
    documents = db.query(Document.id, Document.file_path).filter(Document.user_id == user_id).all()
    document_ids = [row.id for row in documents]
    job_ids = [row[0] for row in db.query(VideoJob.id).filter(VideoJob.user_id == user_id)]

    db.query(ChatMessage).filter(ChatMessage.user_id == user_id).delete(synchronize_session=False)
    db.query(VideoJob).filter(VideoJob.user_id == user_id).delete(synchronize_session=False)
    if document_ids:
        db.query(DocumentChunk).filter(DocumentChunk.document_id.in_(document_ids)).delete(synchronize_session=False)
    db.query(Document).filter(Document.user_id == user_id).delete(synchronize_session=False)
    db.query(UsageCounter).filter(UsageCounter.user_id == user_id).delete(synchronize_session=False)
    db.query(UploadIdempotency).filter(UploadIdempotency.user_id == user_id).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()

    for row in documents:
        try:
            os.remove(row.file_path)
        except FileNotFoundError:
            pass
        except OSError:
            logger.exception("Could not remove an uploaded file of a deleted account.")
    for job_id in job_ids:
        video_jobs.remove_job_files(job_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
