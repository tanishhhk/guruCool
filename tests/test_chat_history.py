"""Each document keeps its chat: saved answers, follow-up context, privacy and clearing."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.api import chat as chat_api
from app.config import settings
from app.main import app
from app.models.chat_message import ChatMessage
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.user import User
from app.services.auth import create_access_token, get_password_hash
from app.services.llm import Answer, AnswerServiceError
from tests.fakes import vector


def _user(factory):
    with factory() as db:
        user = User(id=str(uuid.uuid4()), email=f"u{uuid.uuid4().hex[:8]}@example.com",
                    hashed_password=get_password_hash("Password-123456"))
        db.add(user)
        db.commit()
        token = create_access_token({"sub": user.email, "user_id": user.id})
        return user.id, {"Authorization": f"Bearer {token}"}


def _document(factory, user_id):
    with factory() as db:
        document_id = str(uuid.uuid4())
        db.add(Document(id=document_id, user_id=user_id, filename="report.pdf",
                        file_path=f"{settings.upload_dir}/{document_id}.pdf", file_size=5, status="completed"))
        db.flush()
        chunk = DocumentChunk(id=str(uuid.uuid4()), document_id=document_id, chunk_index=0,
                              chunk_text="The fee is 30 days.", page_start=2, page_end=2,
                              embedding_model="all-MiniLM-L6-v2", embedding_dim=384)
        chunk.set_embedding(vector(0))
        db.add(chunk)
        db.commit()
        return document_id


@pytest.fixture()
def client(db_session_factory, monkeypatch):
    monkeypatch.setattr(chat_api, "generate_single_embedding", lambda _q: vector(0))
    return TestClient(app)


@pytest.fixture()
def answers(monkeypatch):
    """Fake model: records the history it was given and answers with a citation."""
    seen = []

    def fake(question, sources, focus=None, history=None, **_kw):
        seen.append(history)
        return Answer(f"Reply to {question} [S1]", "fake", "fake-model")

    monkeypatch.setattr(chat_api, "generate_answer", fake)
    return seen


def _ask(client, headers, document_id, question="What is the fee?"):
    return client.post("/chat/ask", headers=headers, json={"question": question, "document_id": document_id})


def test_answer_is_saved_to_history(db_session_factory, client, answers):
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id)
    reply = _ask(client, headers, document_id).json()
    assert reply["message_id"] and reply["created_at"]

    history = client.get(f"/chat/history/{document_id}", headers=headers).json()["messages"]
    assert len(history) == 1
    saved = history[0]
    assert saved["id"] == reply["message_id"]
    assert saved["question"] == "What is the fee?"
    assert saved["answer"] == "Reply to What is the fee? [S1]"
    assert saved["answer_status"] == "answered"
    assert saved["sources"][0]["page_start"] == 2 and saved["sources"][0]["cited"] is True


def test_extractive_answer_is_saved_too(db_session_factory, client, monkeypatch):
    def failing(*_args, **_kwargs):
        raise AnswerServiceError("busy")

    monkeypatch.setattr(chat_api, "generate_answer", failing)
    monkeypatch.setattr(chat_api.settings, "answer_fallback", "extractive")
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id)
    assert _ask(client, headers, document_id).json()["answer_status"] == "extractive"
    history = client.get(f"/chat/history/{document_id}", headers=headers).json()["messages"]
    assert [message["answer_status"] for message in history] == ["extractive"]


def test_history_is_private(db_session_factory, client, answers):
    owner_id, owner = _user(db_session_factory)
    _stranger_id, stranger = _user(db_session_factory)
    document_id = _document(db_session_factory, owner_id)
    _ask(client, owner, document_id)
    assert client.get(f"/chat/history/{document_id}", headers=stranger).status_code == 404
    assert client.delete(f"/chat/history/{document_id}", headers=stranger).status_code == 404
    assert len(client.get(f"/chat/history/{document_id}", headers=owner).json()["messages"]) == 1


def test_clear_history(db_session_factory, client, answers):
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id)
    _ask(client, headers, document_id)
    _ask(client, headers, document_id, "And the second point?")
    assert client.delete(f"/chat/history/{document_id}", headers=headers).status_code == 204
    assert client.get(f"/chat/history/{document_id}", headers=headers).json()["messages"] == []


def test_deleting_document_deletes_history(db_session_factory, client, answers):
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id)
    _ask(client, headers, document_id)
    assert client.delete(f"/documents/{document_id}", headers=headers).status_code == 200
    with db_session_factory() as db:
        assert db.query(ChatMessage).filter(ChatMessage.document_id == document_id).count() == 0


def test_follow_up_gets_previous_two_turns(db_session_factory, client, answers):
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id)
    for question in ("First?", "Second?", "Third?", "Fourth?"):
        _ask(client, headers, document_id, question)
    assert answers[0] in (None, [])
    assert answers[3] == [("Second?", "Reply to Second? [S1]"), ("Third?", "Reply to Third? [S1]")]


def test_history_returns_oldest_first_and_respects_limit(db_session_factory, client, answers):
    user_id, headers = _user(db_session_factory)
    document_id = _document(db_session_factory, user_id)
    for question in ("One?", "Two?", "Three?"):
        _ask(client, headers, document_id, question)
    latest = client.get(f"/chat/history/{document_id}?limit=2", headers=headers).json()["messages"]
    assert [message["question"] for message in latest] == ["Two?", "Three?"]
