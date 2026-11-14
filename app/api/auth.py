import time

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import bearer_scheme, get_current_user
from app.config import settings
from app.database import get_db
from app.models.revoked_token import RevokedToken
from app.models.user import User
from app.models.document import Document
from app.schemas.user import (
    CodeResend,
    EmailOnly,
    EmailVerification,
    FirebaseToken,
    PasswordReset,
    ProfileUpdate,
    Registered,
    Token,
    UsageResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services import email_codes, lenses, mailer, plans, sign_in_methods, usage
from app.services.auth import (
    decode_access_token,
    get_password_hash,
    issue_token,
    verify_password,
    verify_password_for_missing_user,
)

router = APIRouter(tags=["Authentication"])


def _find_by_email(db: Session, email) -> User | None:
    return db.query(User).filter(User.email == str(email).strip().lower()).first()


def _send(db: Session, user: User, purpose: str) -> None:
    code = email_codes.issue_code(db, user, purpose)
    if code is not None:
        mailer.send_code(user.email, code, purpose)


_BAD_CODE = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="That code is not right, or it has expired. Ask for a new one.",
)


@router.get("/providers")
def providers():
    """Which sign-in features are switched on, so the web app shows only those."""
    firebase = settings.firebase_enabled
    return {
        "email_verification": settings.email_verification_enabled,
        "google": firebase,
        "phone": firebase and settings.firebase_phone_enabled,
        "firebase": {
            "apiKey": settings.firebase_api_key,
            "authDomain": settings.firebase_auth_domain or f"{settings.firebase_project_id}.firebaseapp.com",
            "projectId": settings.firebase_project_id,
        }
        if firebase
        else None,
    }


@router.post("/firebase", response_model=Token)
def firebase_sign_in(body: FirebaseToken, db: Session = Depends(get_db)):
    """Sign in, or sign up, with a Google or phone sign-in done through Firebase."""
    if not settings.firebase_project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This sign-in method is not available.")
    user = sign_in_methods.user_for_token(db, body.id_token)
    return {"access_token": issue_token(user), "token_type": "bearer"}


@router.post("/register", response_model=Registered, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    email = str(user_data.email).strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        )

    verify = settings.email_verification_enabled
    user = User(email=email, hashed_password=get_password_hash(user_data.password), email_verified=not verify)
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        ) from None
    if verify:
        _send(db, user, "verify")
    return {"id": user.id, "email": user.email, "created_at": user.created_at, "verification_required": verify}


@router.post("/login", response_model=Token)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    email = str(user_data.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if user is None or not user.hashed_password:
        valid = verify_password_for_missing_user(user_data.password)
    else:
        valid = verify_password(user_data.password, user.hashed_password)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if settings.email_verification_enabled and not user.email_verified:
        _send(db, user, "verify")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Check your email for a 6-digit code to finish signing in.",
        )
    return {"access_token": issue_token(user), "token_type": "bearer"}


@router.post("/verify-email", response_model=Token)
def verify_email(body: EmailVerification, db: Session = Depends(get_db)):
    """Confirm an email address with the emailed code, and sign in."""
    user = _find_by_email(db, body.email)
    if user is None or not email_codes.check_code(db, user, "verify", body.code):
        raise _BAD_CODE
    user.email_verified = True
    db.commit()
    db.refresh(user)
    return {"access_token": issue_token(user), "token_type": "bearer"}


@router.post("/resend-code", status_code=status.HTTP_202_ACCEPTED)
def resend_code(body: CodeResend, db: Session = Depends(get_db)):
    """Send a fresh code. Always 202, so the answer never reveals who has an account."""
    user = _find_by_email(db, body.email)
    if user is not None and (body.purpose == "reset" or not user.email_verified):
        _send(db, user, body.purpose)
    return {"detail": "If that address has an account, a code is on its way."}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(body: EmailOnly, db: Session = Depends(get_db)):
    user = _find_by_email(db, body.email)
    if user is not None and settings.email_verification_enabled:
        _send(db, user, "reset")
    return {"detail": "If that address has an account, a code is on its way."}


@router.post("/reset-password", response_model=Token)
def reset_password(body: PasswordReset, db: Session = Depends(get_db)):
    """Choose a new password with the emailed code. Signs out every other device."""
    user = _find_by_email(db, body.email)
    if user is None or not email_codes.check_code(db, user, "reset", body.code):
        raise _BAD_CODE
    user.hashed_password = get_password_hash(body.new_password)
    user.email_verified = True
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    db.refresh(user)
    return {"access_token": issue_token(user), "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """The signed-in user. Lets a client check that a stored token is still valid."""
    return current_user


@router.put("/me/profile", response_model=UserResponse)
def update_profile(
    profile: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save the profession and focus chosen in onboarding."""
    if not lenses.is_valid(profile.profession, profile.focus):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Choose a profession and one of its focus options.",
        )
    current_user.profession, current_user.focus = profile.profession, profile.focus
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/usage", response_model=UsageResponse)
def my_usage(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Today's uploads, questions and video credits, against the plan's daily limits."""
    plan = plans.plan_for(current_user)
    return {
        "plan": {"id": plan.id, "label": plan.label},
        "limits": dict(plan.daily),
        "used": usage.used_today(db, current_user.id),
        "resets_in_seconds": usage.seconds_until_reset(),
        "max_documents": plan.max_documents,
        "story_costs": plans.STORY_COST,
        "story_depths": list(plan.story_depths),
        "documents": db.query(Document).filter(Document.user_id == current_user.id).count(),
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = decode_access_token(credentials.credentials)
    if not payload or payload.get("user_id") != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials.",
        )

    token_id = payload.get("jti")
    expiry = payload.get("exp")
    if not isinstance(token_id, str) or not isinstance(expiry, (int, float)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token cannot be revoked.",
        )

    now = int(time.time())
    db.query(RevokedToken).filter(RevokedToken.expires_at <= now).delete(
        synchronize_session=False
    )
    if db.query(RevokedToken).filter(RevokedToken.jti == token_id).first() is None:
        db.add(RevokedToken(jti=token_id, expires_at=int(expiry)))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
