import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, true

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # Phone-only accounts have no email; Google-only accounts have no password.
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    phone = Column(String(20), unique=True, nullable=True)  # E.164, verified by Firebase
    firebase_uid = Column(String(128), unique=True, nullable=True)  # the Google sign-in
    created_at = Column(DateTime, default=datetime.utcnow)
    # Chosen in onboarding; see app.services.lenses.
    profession = Column(String(20), nullable=True)
    focus = Column(String(20), nullable=True)
    display_name = Column(String(60), nullable=True)
    # Rows from before email verification count as verified; new sign-ups start unverified.
    email_verified = Column(Boolean, nullable=False, default=False, server_default=true())
    # Bumped to sign out every device: tokens carry the version they were issued under.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    # free, plus or pro; see app.services.plans. Set by hand until payments exist.
    plan = Column(String(20), nullable=False, default="free", server_default="free")
    # Defaults for new videos, chosen in the profile.
    story_voice = Column(String(20), nullable=True)
    story_depth = Column(String(20), nullable=True)
    story_style = Column(String(20), nullable=True)

    def __repr__(self):
        return f"<User {self.id}>"
