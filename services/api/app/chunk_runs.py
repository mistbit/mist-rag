from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .chunking import generate_chunk_preview
from .documents import STORAGE_DIR
from .schemas import ChunkRunCatalogResponse, ChunkRunRecord, ChunkRunSummary, SaveChunkRunRequest


CHUNK_RUNS_PATH = STORAGE_DIR / "chunk_runs.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_chunk_runs() -> list[ChunkRunRecord]:
    if not CHUNK_RUNS_PATH.exists():
        return []

    with CHUNK_RUNS_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return [ChunkRunRecord.model_validate(item) for item in payload]


def _write_chunk_runs(runs: list[ChunkRunRecord]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with CHUNK_RUNS_PATH.open("w", encoding="utf-8") as file:
        json.dump([run.model_dump(by_alias=True) for run in runs], file, ensure_ascii=False, indent=2)


def _to_summary(run: ChunkRunRecord) -> ChunkRunSummary:
    return ChunkRunSummary(
        id=run.id,
        title=run.title,
        documentId=run.document_id,
        totalChunks=run.preview_response.stats.totalChunks,
        chunkSize=run.preview_request.chunk_size,
        chunkOverlap=run.preview_request.chunk_overlap,
        charCount=run.preview_response.document.charCount,
        createdAt=run.created_at,
    )


def list_chunk_runs() -> ChunkRunCatalogResponse:
    runs = sorted(_load_chunk_runs(), key=lambda run: run.created_at, reverse=True)
    return ChunkRunCatalogResponse(runs=[_to_summary(run) for run in runs])


def get_chunk_run(run_id: str) -> ChunkRunRecord | None:
    for run in _load_chunk_runs():
        if run.id == run_id:
            return run
    return None


def save_chunk_run(payload: SaveChunkRunRequest) -> ChunkRunRecord:
    preview_response = generate_chunk_preview(payload.preview_request)
    record = ChunkRunRecord(
        id=f"run-{uuid.uuid4().hex[:10]}",
        title=payload.title,
        documentId=payload.document_id,
        createdAt=_utc_now(),
        previewRequest=payload.preview_request,
        previewResponse=preview_response,
    )

    runs = _load_chunk_runs()
    runs.append(record)
    _write_chunk_runs(runs)
    return record


def delete_chunk_run(run_id: str) -> bool:
    runs = _load_chunk_runs()
    remaining = [run for run in runs if run.id != run_id]
    if len(remaining) == len(runs):
        return False

    _write_chunk_runs(remaining)
    return True
