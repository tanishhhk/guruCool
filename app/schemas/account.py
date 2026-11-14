from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.user import _validate_bcrypt_password_bytes
from app.services.voices import VOICES


class AccountResponse(BaseModel):
    id: str
    email: str | None
    email_verified: bool
    display_name: str | None
    phone: str | None = None
    has_password: bool
    sign_in_methods: list[str]
    profession: str | None
    focus: str | None
    plan: str
    created_at: datetime | None
    story_preferences: dict[str, str | None] = {}


class NameUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=60)

    @field_validator("display_name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Enter a name, or keep the one you have.")
        return value


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str | None = Field(default=None, max_length=72)
    new_password: str = Field(min_length=12, max_length=72)

    @field_validator("new_password")
    @classmethod
    def fits_bcrypt(cls, value: str) -> str:
        return _validate_bcrypt_password_bytes(value)


class StoryPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    voice: str
    depth: Literal["overview", "detailed", "deep"]
    style: Literal["strict", "exam"]

    @field_validator("voice")
    @classmethod
    def known_voice(cls, value: str) -> str:
        if value not in VOICES:
            raise ValueError("Choose one of the listed voices.")
        return value


class AccountDeletion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm: Literal["DELETE"]
    password: str | None = Field(default=None, max_length=72)
