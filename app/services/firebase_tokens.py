"""Check Firebase ID tokens from the web app's Google and phone sign-in.

The browser signs in with Firebase and sends the ID token here. It is an RS256
JWT signed by Google; its audience is the Firebase project and its issuer is
securetoken.google.com/<project>. Google's public keys are fetched and cached.
"""
import threading
import time

import jwt

from app.config import settings

KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
LEEWAY_SECONDS = 30

_client = None
_lock = threading.Lock()


class InvalidFirebaseToken(Exception):
    pass


def _signing_key(token: str):
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = jwt.PyJWKClient(KEYS_URL, cache_keys=True, lifespan=3600, timeout=10)
    return _client.get_signing_key_from_jwt(token).key


def verify_firebase_token(token: str) -> dict:
    """The token's claims, or InvalidFirebaseToken if it is not a current token for this project."""
    project = settings.firebase_project_id
    if not project:
        raise InvalidFirebaseToken("Firebase sign-in is not configured.")
    try:
        claims = jwt.decode(
            token,
            _signing_key(token),
            algorithms=["RS256"],
            audience=project,
            issuer=f"https://securetoken.google.com/{project}",
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError, ValueError) as exc:
        raise InvalidFirebaseToken("The sign-in token is not valid.") from exc
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise InvalidFirebaseToken("The sign-in token names no account.")
    if claims.get("auth_time", 0) > time.time() + LEEWAY_SECONDS:
        raise InvalidFirebaseToken("The sign-in token is from the future.")
    return claims


def provider_of(claims: dict) -> str | None:
    firebase = claims.get("firebase")
    return firebase.get("sign_in_provider") if isinstance(firebase, dict) else None
