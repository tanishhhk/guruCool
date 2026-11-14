"""Email verification and password reset by 6-digit code."""
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models.email_code import EmailCode
from app.models.user import User
from app.services import email_codes, mailer

PASSWORD = "StrongPassword123!"


@pytest.fixture()
def client(db_session_factory):
    return TestClient(app)


@pytest.fixture()
def inbox(monkeypatch):
    """Turns verification on and catches every code that would be emailed."""
    sent = []
    monkeypatch.setattr(settings, "email_provider", "console")
    monkeypatch.setattr(mailer, "send_code", lambda email, code, purpose: sent.append((email, code, purpose)))
    return sent


def _register(client, email="new@example.com"):
    return client.post("/auth/register", json={"email": email, "password": PASSWORD})


def _login(client, email="new@example.com", password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_no_provider_means_verified_on_signup(db_session_factory, client):
    registered = _register(client)
    assert registered.status_code == 201
    assert registered.json()["verification_required"] is False
    assert _login(client).status_code == 200


def test_register_sends_code_when_enabled(db_session_factory, client, inbox):
    registered = _register(client)
    assert registered.status_code == 201
    assert registered.json()["verification_required"] is True
    [(email, code, purpose)] = inbox
    assert email == "new@example.com" and purpose == "verify"
    assert len(code) == 6 and code.isdigit()


def test_login_before_verifying_is_refused_and_resends(db_session_factory, client, inbox, monkeypatch):
    _register(client)
    monkeypatch.setattr(email_codes, "RESEND_SECONDS", 0)
    refused = _login(client)
    assert refused.status_code == 403
    assert "6-digit code" in refused.json()["detail"]
    assert len(inbox) == 2
    assert _login(client, password="WrongPassword123!").status_code == 401
    assert len(inbox) == 2  # A wrong password never sends a code.


def test_verify_with_right_code_signs_in(db_session_factory, client, inbox):
    _register(client)
    code = inbox[-1][1]
    verified = client.post("/auth/verify-email", json={"email": "NEW@example.com", "code": code})
    assert verified.status_code == 200
    token = verified.json()["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert _login(client).status_code == 200
    # A code works once.
    assert client.post("/auth/verify-email", json={"email": "new@example.com", "code": code}).status_code == 400


def test_five_wrong_codes_kill_the_code(db_session_factory, client, inbox):
    _register(client)
    code = inbox[-1][1]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/auth/verify-email", json={"email": "new@example.com", "code": wrong}).status_code == 400
    assert client.post("/auth/verify-email", json={"email": "new@example.com", "code": code}).status_code == 400


def test_resend_within_a_minute_sends_nothing(db_session_factory, client, inbox):
    _register(client)
    assert client.post("/auth/resend-code", json={"email": "new@example.com", "purpose": "verify"}).status_code == 202
    assert len(inbox) == 1


def test_unknown_email_gets_202(db_session_factory, client, inbox):
    assert client.post("/auth/resend-code", json={"email": "ghost@example.com", "purpose": "verify"}).status_code == 202
    assert client.post("/auth/forgot-password", json={"email": "ghost@example.com"}).status_code == 202
    assert inbox == []


def test_reset_password_flow(db_session_factory, client, inbox):
    _register(client)
    client.post("/auth/verify-email", json={"email": "new@example.com", "code": inbox[-1][1]})
    old_token = _login(client).json()["access_token"]

    assert client.post("/auth/forgot-password", json={"email": "new@example.com"}).status_code == 202
    email, code, purpose = inbox[-1]
    assert purpose == "reset"
    reset = client.post(
        "/auth/reset-password",
        json={"email": "new@example.com", "code": code, "new_password": "BrandNewPassword-9"},
    )
    assert reset.status_code == 200
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    assert _login(client).status_code == 401
    assert _login(client, password="BrandNewPassword-9").status_code == 200


def test_expired_code_fails(db_session_factory, client, inbox):
    _register(client)
    with db_session_factory() as db:
        db.query(EmailCode).update({EmailCode.expires_at: 1})
        db.commit()
    assert client.post("/auth/verify-email", json={"email": "new@example.com", "code": inbox[-1][1]}).status_code == 400


def test_codes_are_stored_hashed(db_session_factory, client, inbox):
    _register(client)
    with db_session_factory() as db:
        stored = db.query(EmailCode).one()
        assert inbox[-1][1] not in stored.code_hash and len(stored.code_hash) == 64
        assert db.query(User).one().email_verified is False


def test_providers_report_what_is_switched_on(db_session_factory, client, inbox):
    assert client.get("/auth/providers").json() == {
        "email_verification": True,
        "google": False,
        "phone": False,
        "firebase": None,
    }
