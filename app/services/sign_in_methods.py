"""Match a Google or phone sign-in (a Firebase ID token) to a guruCool account."""
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.firebase_tokens import InvalidFirebaseToken, provider_of, verify_firebase_token

GOOGLE, PHONE = "google.com", "phone"


def _claims(id_token: str) -> dict:
    try:
        claims = verify_firebase_token(id_token)
    except InvalidFirebaseToken as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That sign-in did not work. Try again.",
        ) from exc
    provider = provider_of(claims)
    if provider == PHONE and not claims.get("phone_number"):
        provider = None
    if provider not in (GOOGLE, PHONE):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This sign-in method is not supported.")
    return claims


def _email(claims: dict) -> str | None:
    email = claims.get("email")
    return email.strip().lower() if isinstance(email, str) and email.strip() else None


def _save(db: Session, user: User) -> User:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That sign-in already belongs to another guruCool account.",
        ) from None
    db.refresh(user)
    return user


def user_for_token(db: Session, id_token: str) -> User:
    """The account for this sign-in, linked or created as needed."""
    claims = _claims(id_token)
    if provider_of(claims) == PHONE:
        phone = claims["phone_number"]
        user = db.query(User).filter(User.phone == phone).first()
        if user is None:
            user = User(phone=phone, email_verified=False)
            db.add(user)
            _save(db, user)
        return user

    uid, email, verified = claims["sub"], _email(claims), claims.get("email_verified") is True
    user = db.query(User).filter(User.firebase_uid == uid).first()
    if user is not None:
        return user
    existing = db.query(User).filter(User.email == email).first() if email else None
    if existing is not None:
        if not verified:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sign in with your password, then connect Google from your profile.",
            )
        existing.firebase_uid = uid
        existing.email_verified = True
        return _save(db, existing)
    name = claims.get("name")
    user = User(
        email=email,
        email_verified=verified,
        firebase_uid=uid,
        display_name=name.strip()[:60] if isinstance(name, str) and name.strip() else None,
    )
    db.add(user)
    return _save(db, user)


def connect(db: Session, user: User, id_token: str) -> User:
    """Add Google or a phone number to an account that is already signed in."""
    claims = _claims(id_token)
    if provider_of(claims) == PHONE:
        taken = db.query(User).filter(User.phone == claims["phone_number"], User.id != user.id).first()
        if taken:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That phone number is already used by another account.")
        user.phone = claims["phone_number"]
    else:
        taken = db.query(User).filter(User.firebase_uid == claims["sub"], User.id != user.id).first()
        if taken:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That Google account is already used by another account.")
        user.firebase_uid = claims["sub"]
        email = _email(claims)
        if not user.email and email and claims.get("email_verified") is True:
            if not db.query(User).filter(User.email == email).first():
                user.email, user.email_verified = email, True
    return _save(db, user)
