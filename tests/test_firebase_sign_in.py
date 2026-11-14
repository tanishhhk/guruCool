"""Google and phone sign-in: Firebase ID tokens are checked, then matched to an account."""
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models.user import User
from app.services import firebase_tokens
from app.services.auth import get_password_hash

PROJECT = "gurucool-test"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture()
def client(db_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "firebase_project_id", PROJECT)
    monkeypatch.setattr(settings, "firebase_api_key", "public-web-key")
    monkeypatch.setattr(settings, "firebase_auth_domain", f"{PROJECT}.firebaseapp.com")
    monkeypatch.setattr(firebase_tokens, "_signing_key", lambda _token: KEY.public_key())
    return TestClient(app)


def _token(provider="google.com", key=KEY, audience=PROJECT, expires_in=3600, **claims):
    now = int(time.time())
    payload = {
        "iss": f"https://securetoken.google.com/{audience}",
        "aud": audience,
        "sub": claims.pop("sub", uuid.uuid4().hex),
        "iat": now,
        "auth_time": now,
        "exp": now + expires_in,
        "firebase": {"sign_in_provider": provider},
        **claims,
    }
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": "test"})


def _google(email="asha@gmail.com", verified=True, **claims):
    return _token(email=email, email_verified=verified, name="Asha Rao", **claims)


def _sign_in(client, token):
    return client.post("/auth/firebase", json={"id_token": token})


def _me(client, response):
    return client.get("/account", headers={"Authorization": f"Bearer {response.json()['access_token']}"}).json()


def test_google_creates_account(client):
    signed_in = _sign_in(client, _google(sub="google-user-1"))
    assert signed_in.status_code == 200
    account = _me(client, signed_in)
    assert account["email"] == "asha@gmail.com" and account["email_verified"] is True
    assert account["display_name"] == "Asha Rao"
    assert account["sign_in_methods"] == ["google"]
    assert account["has_password"] is False
    # The same Google account signs in to the same guruCool account.
    assert _me(client, _sign_in(client, _google(sub="google-user-1")))["id"] == account["id"]


def test_google_links_verified_email(db_session_factory, client):
    with db_session_factory() as db:
        db.add(User(id="existing", email="asha@gmail.com", hashed_password=get_password_hash("Password-123456")))
        db.commit()
    account = _me(client, _sign_in(client, _google()))
    assert account["id"] == "existing"
    assert account["sign_in_methods"] == ["password", "google"]


def test_unverified_google_email_does_not_link(db_session_factory, client):
    with db_session_factory() as db:
        db.add(User(id="existing", email="asha@gmail.com", hashed_password=get_password_hash("Password-123456")))
        db.commit()
    refused = _sign_in(client, _google(verified=False))
    assert refused.status_code == 409
    assert "connect Google from your profile" in refused.json()["detail"]


def test_phone_creates_phone_account(client):
    phone = _token(provider="phone", phone_number="+919876543210")
    account = _me(client, _sign_in(client, phone))
    assert account["phone"] == "+919876543210"
    assert account["email"] is None
    assert account["sign_in_methods"] == ["phone"]
    again = _token(provider="phone", phone_number="+919876543210")
    assert _me(client, _sign_in(client, again))["id"] == account["id"]


def test_wrong_audience_rejected(client):
    assert _sign_in(client, _google(audience="someone-else")).status_code == 401


def test_expired_token_rejected(client):
    assert _sign_in(client, _google(expires_in=-120)).status_code == 401


def test_forged_signature_rejected(client):
    assert _sign_in(client, _token(key=OTHER_KEY, email="x@gmail.com", email_verified=True)).status_code == 401


def test_sign_in_is_off_without_a_project(client, monkeypatch):
    monkeypatch.setattr(settings, "firebase_project_id", "")
    assert _sign_in(client, _google()).status_code == 404


def test_connect_phone_to_existing_account(db_session_factory, client):
    with db_session_factory() as db:
        db.add(User(id="owner", email="owner@example.com", hashed_password=get_password_hash("Password-123456"),
                    email_verified=True))
        db.commit()
    login = client.post("/auth/login", json={"email": "owner@example.com", "password": "Password-123456"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    connected = client.post("/account/connect", headers=headers,
                            json={"id_token": _token(provider="phone", phone_number="+15550001111")})
    assert connected.status_code == 200
    assert connected.json()["sign_in_methods"] == ["password", "phone"]
    # The phone now signs in to the same account.
    assert _me(client, _sign_in(client, _token(provider="phone", phone_number="+15550001111")))["id"] == "owner"


def test_a_phone_already_used_cannot_be_connected_twice(db_session_factory, client):
    _sign_in(client, _token(provider="phone", phone_number="+15550002222"))
    with db_session_factory() as db:
        db.add(User(id="second", email="second@example.com", hashed_password=get_password_hash("Password-123456"),
                    email_verified=True))
        db.commit()
    login = client.post("/auth/login", json={"email": "second@example.com", "password": "Password-123456"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    refused = client.post("/account/connect", headers=headers,
                          json={"id_token": _token(provider="phone", phone_number="+15550002222")})
    assert refused.status_code == 409


def test_password_login_without_password_fails(client):
    _sign_in(client, _google(email="nopass@gmail.com"))
    assert client.post("/auth/login", json={"email": "nopass@gmail.com", "password": "Anything-12345"}).status_code == 401


def test_providers_describe_firebase(client, monkeypatch):
    monkeypatch.setattr(settings, "firebase_phone_enabled", True)
    providers = client.get("/auth/providers").json()
    assert providers["google"] is True and providers["phone"] is True
    assert providers["firebase"] == {
        "apiKey": "public-web-key",
        "authDomain": f"{PROJECT}.firebaseapp.com",
        "projectId": PROJECT,
    }
