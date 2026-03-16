from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .chunking import generate_chunk_preview
from .documents import STORAGE_DIR, get_document
from .schemas import (
    ChunkPreviewRequest,
    DocumentChunkSetCatalogResponse,
    DocumentChunkSetRecord,
    DocumentChunkSetSummary,
    SaveDocumentChunkSetRequest,
)


DOCUMENT_CHUNK_SETS_PATH = STORAGE_DIR / "document_chunk_sets.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_document_chunk_sets() -> list[DocumentChunkSetRecord]:
    if not DOCUMENT_CHUNK_SETS_PATH.exists():
        return []

    with DOCUMENT_CHUNK_SETS_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return [DocumentChunkSetRecord.model_validate(item) for item in payload]


def _write_document_chunk_sets(records: list[DocumentChunkSetRecord]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with DOCUMENT_CHUNK_SETS_PATH.open("w", encoding="utf-8") as file:
        json.dump([record.model_dump(by_alias=True) for record in records], file, ensure_ascii=False, indent=2)


def _to_summary(record: DocumentChunkSetRecord) -> DocumentChunkSetSummary:
    return DocumentChunkSetSummary(
        id=record.id,
        documentId=record.document_id,
        documentTitle=record.document_title,
        totalChunks=record.preview_response.stats.totalChunks,
        chunkSize=record.preview_request.chunk_size,
        chunkOverlap=record.preview_request.chunk_overlap,
        createdAt=record.created_at,
    )


def list_document_chunk_sets(document_id: str) -> DocumentChunkSetCatalogResponse:
    records = [
        record for record in sorted(_load_document_chunk_sets(), key=lambda item: item.created_at, reverse=True)
        if record.document_id == document_id
    ]
    return DocumentChunkSetCatalogResponse(sets=[_to_summary(record) for record in records])


def get_document_chunk_set(chunk_set_id: str) -> DocumentChunkSetRecord | None:
    for record in _load_document_chunk_sets():
        if record.id == chunk_set_id:
            return record
    return None


def delete_document_chunk_set(chunk_set_id: str) -> bool:
    records = _load_document_chunk_sets()
    remaining = [record for record in records if record.id != chunk_set_id]
    if len(remaining) == len(records):
        return False

    _write_document_chunk_sets(remaining)
    return True


def delete_document_chunk_sets_for_document(document_id: str) -> int:
    records = _load_document_chunk_sets()
    remaining = [record for record in records if record.document_id != document_id]
    deleted_count = len(records) - len(remaining)
    if deleted_count > 0:
        _write_document_chunk_sets(remaining)
    return deleted_count


def save_document_chunk_set(document_id: str, payload: SaveDocumentChunkSetRequest) -> DocumentChunkSetRecord | None:
    document = get_document(document_id)
    if document is None:
        return None

    preview_request = ChunkPreviewRequest(
        title=document.title,
        sourceType=document.source_type,
        content=document.content,
        chunkSize=payload.chunk_size,
        chunkOverlap=payload.chunk_overlap,
    )
    preview_response = generate_chunk_preview(preview_request)

    record = DocumentChunkSetRecord(
        id=f"chunkset-{uuid.uuid4().hex[:10]}",
        documentId=document.id,
        documentTitle=document.title,
        createdAt=_utc_now(),
        previewRequest=preview_request,
        previewResponse=preview_response,
    )

    records = _load_document_chunk_sets()
    records.append(record)
    _write_document_chunk_sets(records)
    return record
