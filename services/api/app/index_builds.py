from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from collections import Counter
from datetime import datetime, timezone

from .document_chunks import get_document_chunk_set
from .documents import STORAGE_DIR
from .schemas import (
    ChunkVectorRecord,
    CreateIndexBuildRequest,
    IndexBuildCatalogResponse,
    IndexBuildRecord,
    IndexBuildSummary,
)


INDEX_BUILDS_PATH = STORAGE_DIR / "index_builds.json"
TOKEN_PATTERN = re.compile(r"[A-Za-z0-9\u4e00-\u9fff]+")


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_index_builds() -> list[IndexBuildRecord]:
    if not INDEX_BUILDS_PATH.exists():
        return []

    with INDEX_BUILDS_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return [IndexBuildRecord.model_validate(item) for item in payload]


def _write_index_builds(records: list[IndexBuildRecord]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with INDEX_BUILDS_PATH.open("w", encoding="utf-8") as file:
        json.dump([record.model_dump(by_alias=True) for record in records], file, ensure_ascii=False, indent=2)


def _to_summary(record: IndexBuildRecord) -> IndexBuildSummary:
    return IndexBuildSummary(
        id=record.id,
        chunkSetId=record.chunk_set_id,
        documentId=record.document_id,
        documentTitle=record.document_title,
        chunkSetLabel=record.chunk_set_label,
        status=record.status,
        embeddingModel=record.embedding_model,
        vectorDimensions=record.vector_dimensions,
        totalVectors=record.total_vectors,
        vocabularySize=record.vocabulary_size,
        averageTokenCount=record.average_token_count,
        createdAt=record.created_at,
        updatedAt=record.updated_at,
    )


def tokenize_for_embedding(text: str) -> list[str]:
    return [match.group(0).lower() for match in TOKEN_PATTERN.finditer(text)]


def build_hash_embedding(tokens: list[str], dimensions: int) -> list[float]:
    vector = [0.0] * dimensions
    frequencies = Counter(tokens)

    for token, count in frequencies.items():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        bucket = digest[0] % dimensions
        sign = 1.0 if digest[1] % 2 == 0 else -1.0
        weight = math.sqrt(count)
        vector[bucket] += sign * weight

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector

    return [round(value / norm, 6) for value in vector]


def list_index_builds(chunk_set_id: str) -> IndexBuildCatalogResponse:
    builds = [
        record for record in sorted(_load_index_builds(), key=lambda item: item.created_at, reverse=True)
        if record.chunk_set_id == chunk_set_id
    ]
    return IndexBuildCatalogResponse(builds=[_to_summary(record) for record in builds])


def get_index_build(build_id: str) -> IndexBuildRecord | None:
    for record in _load_index_builds():
        if record.id == build_id:
            return record
    return None


def create_index_build(chunk_set_id: str, payload: CreateIndexBuildRequest) -> IndexBuildRecord | None:
    chunk_set = get_document_chunk_set(chunk_set_id)
    if chunk_set is None:
        return None

    token_totals: list[int] = []
    token_counter: Counter[str] = Counter()
    chunk_vectors: list[ChunkVectorRecord] = []

    for chunk in chunk_set.preview_response.chunks:
        tokens = tokenize_for_embedding(chunk.text)
        token_counter.update(tokens)
        token_totals.append(chunk.tokenCount)
        chunk_vectors.append(
            ChunkVectorRecord(
                chunkId=chunk.id,
                tokenCount=chunk.tokenCount,
                startOffset=chunk.startOffset,
                endOffset=chunk.endOffset,
                values=build_hash_embedding(tokens, payload.vector_dimensions),
            )
        )

    now = _utc_now()
    record = IndexBuildRecord(
        id=f"index-{uuid.uuid4().hex[:10]}",
        chunkSetId=chunk_set.id,
        documentId=chunk_set.document_id,
        documentTitle=chunk_set.document_title,
        chunkSetLabel=chunk_set.label,
        status="ready",
        embeddingModel=payload.embedding_model,
        vectorDimensions=payload.vector_dimensions,
        totalVectors=len(chunk_vectors),
        vocabularySize=len(token_counter),
        averageTokenCount=0 if not token_totals else math.ceil(sum(token_totals) / len(token_totals)),
        createdAt=now,
        updatedAt=now,
        topTerms=[term for term, _count in token_counter.most_common(8)],
        chunkVectors=chunk_vectors,
    )

    records = _load_index_builds()
    records.append(record)
    _write_index_builds(records)
    return record


def delete_index_builds_for_chunk_set(chunk_set_id: str) -> int:
    records = _load_index_builds()
    remaining = [record for record in records if record.chunk_set_id != chunk_set_id]
    deleted_count = len(records) - len(remaining)
    if deleted_count > 0:
        _write_index_builds(remaining)
    return deleted_count
