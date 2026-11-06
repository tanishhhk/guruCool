from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text

from app.database import Base


class ChatMessage(Base):
    """One question about a document and the answer it got, kept as the document's chat."""

    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_document_id_created_at", "document_id", "created_at"),)

    id = Column(String(36), primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    # answered, not_found or extractive
    answer_status = Column(String(20), nullable=False)
    sources = Column(Text, nullable=False)  # JSON list, as returned by POST /chat/ask
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
