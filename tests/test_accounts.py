"""Accounts: versioned sign-in tokens, profile changes, password changes and deletion."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.services.auth import create_access_token, decode_access_token, get_password_hash, issue_token

PASSWORD = "Password-123456"


@pytest.fixture()
def client(db_session_factory):
    return TestClient(app)


def _user(factory, **fields):
    with factory() as db:
        user = User(id=str(uuid.uuid4()), email=f"u{uuid.uuid4().hex[:8]}@example.com",
                    hashed_password=get_password_hash(PASSWORD), **fields)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_tokens_name_the_user_by_id_and_carry_a_version(db_session_factory, client):
    user = _user(db_session_factory)
    token = client.post("/auth/login", json={"email": user.email, "password": PASSWORD}).json()["access_token"]
    payload = decode_access_token(token)
    assert payload["sub"] == user.id and payload["user_id"] == user.id
    assert payload["ver"] == 0
    assert client.get("/auth/me", headers=_bearer(token)).status_code == 200


def test_email_subject_tokens_still_work(db_session_factory, client):
    user = _user(db_session_factory)
    old_style = create_access_token({"sub": user.email, "user_id": user.id})
    assert client.get("/auth/me", headers=_bearer(old_style)).json()["id"] == user.id


def test_token_from_older_version_is_rejected(db_session_factory, client):
    user = _user(db_session_factory, token_version=1)
    stale = create_access_token({"sub": user.id, "user_id": user.id, "ver": 0})
    assert client.get("/auth/me", headers=_bearer(stale)).status_code == 401
    assert client.get("/auth/me", headers=_bearer(issue_token(user))).status_code == 200


# The account endpoints


def _signed_in(factory, client, **fields):
    user = _user(factory, **fields)
    token = client.post("/auth/login", json={"email": user.email, "password": PASSWORD}).json()["access_token"]
    return user, _bearer(token)


def test_get_account(db_session_factory, client):
    user, headers = _signed_in(db_session_factory, client, display_name="Asha Rao")
    account = client.get("/account", headers=headers).json()
    assert account["id"] == user.id and account["email"] == user.email
    assert account["display_name"] == "Asha Rao"
    assert account["has_password"] is True
    assert account["sign_in_methods"] == ["password"]
    assert account["plan"] == "free"


def test_rename(db_session_factory, client):
    _user_row, headers = _signed_in(db_session_factory, client)
    assert client.patch("/account", headers=headers, json={"display_name": "  Asha  "}).json()["display_name"] == "Asha"
    assert client.patch("/account", headers=headers, json={"display_name": "   "}).status_code == 422
    assert client.patch("/account", headers=headers, json={"display_name": "x" * 61}).status_code == 422


def test_change_password_needs_current(db_session_factory, client):
    user, headers = _signed_in(db_session_factory, client)
    wrong = client.post("/account/password", headers=headers,
                        json={"current_password": "not-it-at-all", "new_password": "AnotherPassword-1"})
    assert wrong.status_code == 400
    missing = client.post("/account/password", headers=headers, json={"new_password": "AnotherPassword-1"})
    assert missing.status_code == 400
    short = client.post("/account/password", headers=headers,
                        json={"current_password": PASSWORD, "new_password": "short"})
    assert short.status_code == 422


def test_change_password_signs_out_other_tokens(db_session_factory, client):
    user, headers = _signed_in(db_session_factory, client)
    changed = client.post("/account/password", headers=headers,
                          json={"current_password": PASSWORD, "new_password": "AnotherPassword-1"})
    assert changed.status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.get("/auth/me", headers=_bearer(changed.json()["access_token"])).status_code == 200
    assert client.post("/auth/login", json={"email": user.email, "password": "AnotherPassword-1"}).status_code == 200


def test_sign_out_everywhere(db_session_factory, client):
    _user_row, first = _signed_in(db_session_factory, client)
    fresh = client.post("/account/sign-out-everywhere", headers=first)
    assert fresh.status_code == 200
    assert client.get("/auth/me", headers=first).status_code == 401
    assert client.get("/auth/me", headers=_bearer(fresh.json()["access_token"])).status_code == 200


def test_delete_account_needs_confirmation(db_session_factory, client):
    _user_row, headers = _signed_in(db_session_factory, client)
    assert client.post("/account/delete", headers=headers, json={"confirm": "delete", "password": PASSWORD}).status_code == 422
    assert client.post("/account/delete", headers=headers, json={"confirm": "DELETE", "password": "wrong-password"}).status_code == 400
    assert client.get("/auth/me", headers=headers).status_code == 200


def test_delete_account_removes_files_and_rows(db_session_factory, client, tmp_path, monkeypatch):
    from app.config import settings
    from app.models.chat_message import ChatMessage
    from app.models.document import Document
    from app.models.upload_idempotency import UploadIdempotency
    from app.models.video_job import VideoJob

    monkeypatch.setattr(settings, "video_dir", str(tmp_path / "videos"))
    user, headers = _signed_in(db_session_factory, client)
    upload = tmp_path / "doc.pdf"
    upload.write_bytes(b"%PDF")
    video_folder = tmp_path / "videos" / "job-1"
    video_folder.mkdir(parents=True)
    (video_folder / "story.mp4").write_bytes(b"mp4")
    with db_session_factory() as db:
        db.add(Document(id="doc-1", user_id=user.id, filename="a.pdf", file_path=str(upload), file_size=4, status="completed"))
        db.flush()
        db.add(VideoJob(id="job-1", document_id="doc-1", user_id=user.id, strictness="strict", depth="overview",
                        status="completed", stage="completed", progress=100))
        db.add(ChatMessage(id="m-1", user_id=user.id, document_id="doc-1", question="q", answer="a",
                           answer_status="answered", sources="[]"))
        db.add(UploadIdempotency(user_id=user.id, idempotency_key="k", document_id="doc-1", status="completed",
                                 expires_at=2_000_000_000))
        db.commit()

    deleted = client.post("/account/delete", headers=headers, json={"confirm": "DELETE", "password": PASSWORD})
    assert deleted.status_code == 204
    assert not upload.exists() and not video_folder.exists()
    with db_session_factory() as db:
        assert db.get(User, user.id) is None
        assert db.query(Document).count() == 0
        assert db.query(VideoJob).count() == 0
        assert db.query(ChatMessage).count() == 0
    assert client.get("/auth/me", headers=headers).status_code == 401
