import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, true

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Chosen in onboarding; see app.services.lenses.
    profession = Column(String(20), nullable=True)
    focus = Column(String(20), nullable=True)
    display_name = Column(String(60), nullable=True)
    # Rows from before email verification count as verified; new sign-ups start unverified.
    email_verified = Column(Boolean, nullable=False, default=False, server_default=true())
    # Bumped to sign out every device: tokens carry the version they were issued under.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")

    def __repr__(self):
        return f"<User {self.id}>"
