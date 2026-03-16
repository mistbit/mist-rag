from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .schemas import (
    DocumentCatalogResponse,
    DocumentRecord,
    DocumentSourceType,
    DocumentSummary,
    SaveDocumentRequest,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_DATASET_DIR = REPO_ROOT / "datasets" / "demo-corpus"
STORAGE_DIR = REPO_ROOT / "services" / "api" / "storage"
SAVED_DOCUMENTS_PATH = STORAGE_DIR / "documents.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _file_timestamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat()


def _build_excerpt(content: str, limit: int = 140) -> str:
    compact = " ".join(content.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _load_saved_documents() -> list[DocumentRecord]:
    if not SAVED_DOCUMENTS_PATH.exists():
        return []

    with SAVED_DOCUMENTS_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return [DocumentRecord.model_validate(item) for item in payload]


def _write_saved_documents(documents: list[DocumentRecord]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with SAVED_DOCUMENTS_PATH.open("w", encoding="utf-8") as file:
        json.dump([document.model_dump(by_alias=True) for document in documents], file, ensure_ascii=False, indent=2)


def _sample_source_type(path: Path) -> DocumentSourceType:
    if path.suffix.lower() == ".md":
        return "md"
    return "txt"


def _load_sample_documents() -> list[DocumentRecord]:
    if not SAMPLE_DATASET_DIR.exists():
        return []

    documents: list[DocumentRecord] = []
    for path in sorted(SAMPLE_DATASET_DIR.glob("*")):
        if path.suffix.lower() not in {".md", ".txt"}:
            continue

        content = path.read_text(encoding="utf-8")
        timestamp = _file_timestamp(path)
        documents.append(
            DocumentRecord(
                id=f"sample-{path.stem}",
                title=path.name,
                sourceType=_sample_source_type(path),
                content=content,
                origin="sample",
                createdAt=timestamp,
                updatedAt=timestamp,
                metadata={"dataset": "demo-corpus", "path": str(path.relative_to(REPO_ROOT))},
            )
        )

    return documents


def _to_summary(document: DocumentRecord) -> DocumentSummary:
    return DocumentSummary(
        id=document.id,
        title=document.title,
        sourceType=document.source_type,
        origin=document.origin,
        excerpt=_build_excerpt(document.content),
        charCount=len(document.content),
        updatedAt=document.updated_at,
    )


def list_documents() -> DocumentCatalogResponse:
    samples = sorted(_load_sample_documents(), key=lambda document: document.updated_at, reverse=True)
    saved = sorted(_load_saved_documents(), key=lambda document: document.updated_at, reverse=True)
    return DocumentCatalogResponse(
        samples=[_to_summary(document) for document in samples],
        saved=[_to_summary(document) for document in saved],
    )


def get_document(document_id: str) -> DocumentRecord | None:
    for document in _load_sample_documents():
        if document.id == document_id:
            return document

    for document in _load_saved_documents():
        if document.id == document_id:
            return document

    return None


def save_document(payload: SaveDocumentRequest) -> DocumentRecord:
    now = _utc_now()
    document = DocumentRecord(
        id=f"doc-{uuid.uuid4().hex[:10]}",
        title=payload.title,
        sourceType=payload.source_type,
        content=payload.content,
        origin="saved",
        createdAt=now,
        updatedAt=now,
        metadata={"source": "manual-save"},
    )

    documents = _load_saved_documents()
    documents.append(document)
    _write_saved_documents(documents)
    return document


def delete_document(document_id: str) -> bool:
    documents = _load_saved_documents()
    remaining = [document for document in documents if document.id != document_id]
    if len(remaining) == len(documents):
        return False

    _write_saved_documents(remaining)
    return True
