from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _validate_bcrypt_password_bytes(password: str) -> str:
    # bcrypt considers only up to 72 input bytes; reject longer values instead
    # of silently accepting ambiguous passwords or returning a server error.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes when hashed with bcrypt.")
    return password


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_bcrypt_password_bytes(value)


class FirebaseToken(BaseModel):
    id_token: str = Field(min_length=20, max_length=4096)


class EmailOnly(BaseModel):
    email: EmailStr


class CodeResend(BaseModel):
    email: EmailStr
    purpose: Literal["verify", "reset"] = "verify"


class EmailVerification(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\s*\d{6}\s*$")


class PasswordReset(EmailVerification):
    new_password: str = Field(min_length=12, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_bcrypt_password_bytes(value)


class Registered(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    created_at: datetime
    verification_required: bool


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_bcrypt_password_bytes(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str | None = None
    phone: str | None = None
    created_at: datetime
    profession: str | None = None
    focus: str | None = None
    display_name: str | None = None
    plan: str = "free"
    story_voice: str | None = None
    story_depth: str | None = None
    story_style: str | None = None


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profession: str = Field(min_length=1, max_length=20)
    focus: str = Field(min_length=1, max_length=20)


class UsageResponse(BaseModel):
    plan: dict[str, str]
    limits: dict[str, int]
    used: dict[str, int]
    resets_in_seconds: int
    max_documents: int
    documents: int
    story_costs: dict[str, int]
    story_depths: list[str]
    note: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str
