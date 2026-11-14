import json
import logging
import re
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from app.models.document_chunk import DocumentChunk
from app.services.embeddings import EMBEDDING_DIMENSION, EMBEDDING_MODEL
from app.services.ranking import rank
from app.services.reranker import rerank

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetrievedChunk:
    source_id: str
    chunk_index: int
    text: str
    page_start: int | None
    page_end: int | None
    score: float


@dataclass(frozen=True)
class RetrievalResult:
    chunks: list[RetrievedChunk]
    searched: int
    skipped: int
    overview: bool = False


# Questions about the whole document ("what is this pdf about", "summarise it")
# need its opening, where the title and the author or organisation are named,
# and a wider spread of passages than a question about one detail.
_DOC = r"(?:pdf|document|doc|file|brochure|report|paper|deck|presentation|handbook|book|chapter)"
_OVERVIEW = re.compile(
    rf"""\b(?:
        summar(?:y|ise|ize|ised|ized|ising|izing)
      | overview | gist | tl;?dr | in\s+(?:short|brief|a\s+nutshell)
      | main\s+(?:points?|ideas?|topics?|themes?) | key\s+(?:points|takeaways|ideas)
      | what(?:'s|s)?\s+(?:is\s+|are\s+)?(?:this|the|it)\s*(?:{_DOC}\s*)?(?:all\s+)?about
      | what\s+(?:is|are)\s+(?:told|said|written|covered|explained|discussed|described|mentioned)\s+(?:in|by)
      | what\s+does\s+(?:this|the|it)\s*(?:{_DOC}\s*)?(?:say|tell|cover|contain|explain|describe|talk\s+about)
      | (?:tell|explain)\s+(?:me\s+)?(?:about\s+)?(?:this|the)\s+{_DOC}
      | who\s+(?:wrote|made|published|is\s+behind|is\s+this\s+from)
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)
OVERVIEW_OPENING = 2
OVERVIEW_TOP_K = 6


def is_overview(question: str | None) -> bool:
    return bool(question) and _OVERVIEW.search(question) is not None


def _usable_vector(raw: str):
    try:
        vector = np.asarray(json.loads(raw), dtype=np.float32)
    except (TypeError, ValueError):
        return None
    if vector.shape != (EMBEDDING_DIMENSION,) or not np.isfinite(vector).all():
        return None
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0 else None


def _dedupe_key(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def retrieve(
    db: Session, document_id: str, question_vector, top_k: int, question: str | None = None
) -> RetrievalResult:
    """Rank a document's chunks for the question.

    With the question text, embedding similarity is fused with BM25 keyword
    scores and the top candidates are re-ranked (app.services.ranking);
    without it, chunks are ranked by cosine similarity alone.

    The caller must already have checked that the document belongs to the
    current user. Chunks embedded by a different model, or with vectors that
    are malformed, the wrong size, non-finite or zero, are skipped.
    """
    rows = (
        db.query(
            DocumentChunk.chunk_index,
            DocumentChunk.chunk_text,
            DocumentChunk.embedding,
            DocumentChunk.page_start,
            DocumentChunk.page_end,
            DocumentChunk.embedding_model,
        )
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )

    usable, vectors = [], []
    for row in rows:
        vector = _usable_vector(row.embedding) if row.embedding_model == EMBEDDING_MODEL else None
        if vector is not None:
            usable.append(row)
            vectors.append(vector)
    skipped = len(rows) - len(usable)
    if skipped:
        logger.warning(
            "Skipped unusable chunk embeddings.",
            extra={"document_id": document_id, "skipped": skipped},
        )
    if not usable:
        return RetrievalResult([], searched=len(rows), skipped=skipped)

    query = np.asarray(question_vector, dtype=np.float32)
    query = query / np.linalg.norm(query)
    scores = np.vstack(vectors) @ query

    if question:
        order = rank(question, [row.chunk_text for row in usable], scores, rerank)
    else:
        order = np.argsort(-scores, kind="stable")

    overview = is_overview(question)
    limit = max(top_k, OVERVIEW_TOP_K) if overview else top_k
    # An overview always starts from the document's opening, then the best matches.
    candidates = [*range(min(OVERVIEW_OPENING, len(usable))), *order] if overview else order

    picks, seen = [], set()
    for index in candidates:
        key = _dedupe_key(usable[index].chunk_text)
        if key in seen:
            continue
        seen.add(key)
        picks.append(int(index))
        if len(picks) == limit:
            break
    if overview:
        # In reading order, so the model sees the document as it unfolds.
        picks.sort(key=lambda index: usable[index].chunk_index)

    selected = [
        RetrievedChunk(
            source_id=f"S{position + 1}",
            chunk_index=usable[index].chunk_index,
            text=usable[index].chunk_text,
            page_start=usable[index].page_start,
            page_end=usable[index].page_end,
            score=float(scores[index]),
        )
        for position, index in enumerate(picks)
    ]
    return RetrievalResult(selected, searched=len(rows), skipped=skipped, overview=overview)
