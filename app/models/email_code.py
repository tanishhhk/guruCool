from sqlalchemy import Column, ForeignKey, Integer, String

from app.database import Base


class EmailCode(Base):
    """A 6-digit code emailed to verify an address or reset a password. Only its hash is kept."""

    __tablename__ = "email_codes"

    id = Column(String(36), primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose = Column(String(10), nullable=False)  # verify or reset
    code_hash = Column(String(64), nullable=False)
    expires_at = Column(Integer, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(Integer, nullable=False)
