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
