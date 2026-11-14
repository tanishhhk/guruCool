"""The shelf's activity feed: each document with its chat and story counts, latest activity first."""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.chat_message import ChatMessage
from app.models.document import Document
from app.models.user import User
from app.models.video_job import VideoJob
from app.services.auth import create_access_token, get_password_hash

NOW = datetime(2026, 11, 6, 12, 0, 0)


def _user(factory):
    with factory() as db:
        user = User(id=str(uuid.uuid4()), email=f"u{uuid.uuid4().hex[:8]}@example.com",
                    hashed_password=get_password_hash("Password-123456"))
        db.add(user)
        db.commit()
        return user.id, {"Authorization": f"Bearer {create_access_token({'sub': user.email, 'user_id': user.id})}"}


def _document(factory, user_id, name, uploaded):
    with factory() as db:
        document_id = str(uuid.uuid4())
        db.add(Document(id=document_id, user_id=user_id, filename=name, file_path=f"/tmp/{document_id}.pdf",
                        file_size=5, status="completed", page_count=3, upload_date=uploaded))
        db.commit()
        return document_id


def _message(factory, user_id, document_id, question, at):
    with factory() as db:
        db.add(ChatMessage(id=str(uuid.uuid4()), user_id=user_id, document_id=document_id, question=question,
                           answer="An answer.", answer_status="answered", sources="[]", created_at=at))
        db.commit()


def _story(factory, user_id, document_id, at):
    with factory() as db:
        db.add(VideoJob(id=str(uuid.uuid4()), document_id=document_id, user_id=user_id, strictness="strict",
                        depth="overview", status="completed", stage="done", progress=100, created_at=at))
        db.commit()


@pytest.fixture()
def client(db_session_factory):
    return TestClient(app)


def test_activity_counts_messages_and_stories(db_session_factory, client):
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id, "notes.pdf", NOW - timedelta(days=3))
    _message(db_session_factory, user_id, document_id, "First?", NOW - timedelta(days=2))
    _message(db_session_factory, user_id, document_id, "Latest?", NOW - timedelta(days=1))
    _story(db_session_factory, user_id, document_id, NOW - timedelta(hours=30))

    [item] = client.get("/activity", headers=headers).json()["documents"]
    assert item["id"] == document_id
    assert item["filename"] == "notes.pdf"
    assert item["page_count"] == 3 and item["status"] == "completed"
    assert item["message_count"] == 2
    assert item["story_count"] == 1
    assert item["last_question"] == "Latest?"
    assert item["last_activity_at"].startswith((NOW - timedelta(days=1)).isoformat()[:16])


def test_activity_orders_by_latest_activity(db_session_factory, client):
    user_id, headers = _user(db_session_factory)
    old = _document(db_session_factory, user_id, "old.pdf", NOW - timedelta(days=10))
    new = _document(db_session_factory, user_id, "new.pdf", NOW - timedelta(days=5))
    quiet = _document(db_session_factory, user_id, "quiet.pdf", NOW - timedelta(days=7))
    _message(db_session_factory, user_id, old, "Back to this?", NOW - timedelta(hours=1))
    _story(db_session_factory, user_id, quiet, NOW - timedelta(days=4))

    order = [item["id"] for item in client.get("/activity", headers=headers).json()["documents"]]
    assert order == [old, quiet, new]


def test_activity_is_private(db_session_factory, client):
    owner_id, _owner = _user(db_session_factory)
    _stranger_id, stranger = _user(db_session_factory)
    _document(db_session_factory, owner_id, "secret.pdf", NOW)
    assert client.get("/activity", headers=stranger).json()["documents"] == []
    assert client.get("/activity").status_code == 401
