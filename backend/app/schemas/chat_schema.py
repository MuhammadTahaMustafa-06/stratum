from typing import Annotated, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.km_schema import SourceMetadata


class ChatMessage(BaseModel):
    role: Annotated[str, Field(min_length=1, max_length=32)]
    content: Annotated[str, Field(min_length=1, max_length=32000)]

    @field_validator("role")
    @classmethod
    def role_allowed(cls, v: str) -> str:
        s = (v or "").strip().lower()
        if s not in ("user", "assistant", "system"):
            raise ValueError('role must be "user", "assistant", or "system".')
        return s


class ChatRequest(BaseModel):
    query: Annotated[str, Field(min_length=1, max_length=8000)]
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)
    domain: Optional[Annotated[str, Field(max_length=64)]] = None

    @field_validator("history", mode="before")
    @classmethod
    def history_none_to_empty(cls, v):
        return v if v is not None else []


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceMetadata] = []
    confidence: float = 0.0
    used_fallback: bool = False
