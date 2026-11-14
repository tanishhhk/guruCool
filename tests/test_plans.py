"""Plans and credits: what each plan allows, what a video costs, and that limits hold under races."""
import threading
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.user import User
from app.services import plans, usage
from app.services.auth import create_access_token, get_password_hash
from tests.fakes import vector


@pytest.fixture()
def client(db_session_factory, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "video_dir", str(tmp_path / "videos"))
    return TestClient(app)


def _user(factory, plan="free"):
    with factory() as db:
        user = User(id=str(uuid.uuid4()), email=f"u{uuid.uuid4().hex[:8]}@example.com",
                    hashed_password=get_password_hash("Password-123456"), plan=plan)
        db.add(user)
        db.commit()
        token = create_access_token({"sub": user.id, "user_id": user.id})
        return user.id, {"Authorization": f"Bearer {token}"}


def _document(factory, user_id):
    with factory() as db:
        document_id = str(uuid.uuid4())
        db.add(Document(id=document_id, user_id=user_id, filename="report.pdf",
                        file_path=f"{settings.upload_dir}/{document_id}.pdf", file_size=5, status="completed"))
        db.flush()
        chunk = DocumentChunk(id=str(uuid.uuid4()), document_id=document_id, chunk_index=0,
                              chunk_text="The fee is 30 days.", page_start=1, page_end=1,
                              embedding_model="all-MiniLM-L6-v2", embedding_dim=384)
        chunk.set_embedding(vector(0))
        db.add(chunk)
        db.commit()
        return document_id


def _story(client, headers, document_id, depth):
    return client.post(f"/videos/generate/{document_id}", headers=headers, json={"depth": depth})


def test_detailed_story_costs_two(db_session_factory, client, monkeypatch):
    monkeypatch.setattr(settings, "daily_stories_per_user", 3)
    user_id, headers = _user(db_session_factory)
    assert _story(client, headers, _document(db_session_factory, user_id), "detailed").status_code == 202
    assert client.get("/auth/me/usage", headers=headers).json()["used"]["story"] == 2


def test_a_story_costing_more_than_is_left_is_refused(db_session_factory, client, monkeypatch):
    monkeypatch.setattr(settings, "daily_stories_per_user", 1)
    user_id, headers = _user(db_session_factory)
    refused = _story(client, headers, _document(db_session_factory, user_id), "detailed")
    assert refused.status_code == 429
    assert "video credit" in refused.json()["detail"]


def test_deep_story_needs_plus(db_session_factory, client):
    user_id, headers = _user(db_session_factory)
    refused = _story(client, headers, _document(db_session_factory, user_id), "deep")
    assert refused.status_code == 403
    assert refused.json()["detail"] == "Deep dive comes with Plus."
    plus_id, plus = _user(db_session_factory, plan="plus")
    assert _story(client, plus, _document(db_session_factory, plus_id), "deep").status_code == 202


def test_concurrent_spend_never_overshoots(db_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "daily_questions_per_user", 1)
    user_id, _headers = _user(db_session_factory)
    results = []
    barrier = threading.Barrier(2)

    def spend():
        with db_session_factory() as db:
            barrier.wait()
            try:
                usage.consume(db, user_id, "question")
                db.commit()
                results.append("ok")
            except HTTPException as refused:
                db.rollback()
                results.append(refused.status_code)

    threads = [threading.Thread(target=spend) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results, key=str) == [429, "ok"]


def test_plus_user_gets_plus_limits(db_session_factory, client):
    _user_id, headers = _user(db_session_factory, plan="plus")
    report = client.get("/auth/me/usage", headers=headers).json()
    assert report["plan"] == {"id": "plus", "label": "Plus"}
    assert report["limits"] == {"upload": 20, "question": 100, "story": 10}
    assert report["max_documents"] == 100


def test_usage_reports_plan_and_costs(db_session_factory, client):
    _user_id, headers = _user(db_session_factory)
    report = client.get("/auth/me/usage", headers=headers).json()
    assert report["plan"] == {"id": "free", "label": "Free"}
    assert report["story_costs"] == {"overview": 1, "detailed": 2, "deep": 3}
    assert report["story_depths"] == ["overview", "detailed"]


def test_plans_endpoint_lists_three(db_session_factory, client):
    listed = client.get("/plans").json()
    assert [plan["id"] for plan in listed] == ["free", "plus", "pro"]
    assert listed[0]["daily"]["question"] == settings.daily_questions_per_user
    assert plans.STORY_COST["deep"] == 3
