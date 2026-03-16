from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .documents import STORAGE_DIR
from .retrieval import search_index_build
from .schemas import (
    RetrievalTraceCatalogResponse,
    RetrievalTraceRecord,
    RetrievalTraceSummary,
    SearchIndexBuildRequest,
)


RETRIEVAL_TRACES_PATH = STORAGE_DIR / "retrieval_traces.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_retrieval_traces() -> list[RetrievalTraceRecord]:
    if not RETRIEVAL_TRACES_PATH.exists():
        return []

    with RETRIEVAL_TRACES_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return [RetrievalTraceRecord.model_validate(item) for item in payload]


def _write_retrieval_traces(records: list[RetrievalTraceRecord]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with RETRIEVAL_TRACES_PATH.open("w", encoding="utf-8") as file:
        json.dump([record.model_dump(by_alias=True) for record in records], file, ensure_ascii=False, indent=2)


def _to_summary(record: RetrievalTraceRecord) -> RetrievalTraceSummary:
    return RetrievalTraceSummary(
        id=record.id,
        buildId=record.build_id,
        chunkSetId=record.chunk_set_id,
        documentId=record.document_id,
        documentTitle=record.document_title,
        query=record.search_response.query,
        topK=record.search_response.top_k,
        scoreThreshold=record.search_response.score_threshold,
        totalResults=len(record.search_response.results),
        createdAt=record.created_at,
    )


def list_retrieval_traces(build_id: str) -> RetrievalTraceCatalogResponse:
    traces = [
        record for record in sorted(_load_retrieval_traces(), key=lambda item: item.created_at, reverse=True)
        if record.build_id == build_id
    ]
    return RetrievalTraceCatalogResponse(traces=[_to_summary(record) for record in traces])


def get_retrieval_trace(trace_id: str) -> RetrievalTraceRecord | None:
    for record in _load_retrieval_traces():
        if record.id == trace_id:
            return record
    return None


def save_retrieval_trace(build_id: str, payload: SearchIndexBuildRequest) -> RetrievalTraceRecord | None:
    search_response = search_index_build(build_id, payload)
    if search_response is None:
        return None

    record = RetrievalTraceRecord(
        id=f"trace-{uuid.uuid4().hex[:10]}",
        buildId=search_response.build_id,
        chunkSetId=search_response.chunk_set_id,
        documentId=search_response.document_id,
        documentTitle=search_response.document_title,
        createdAt=_utc_now(),
        searchResponse=search_response,
    )

    records = _load_retrieval_traces()
    records.append(record)
    _write_retrieval_traces(records)
    return record


def delete_retrieval_trace(trace_id: str) -> bool:
    records = _load_retrieval_traces()
    remaining = [record for record in records if record.id != trace_id]
    if len(remaining) == len(records):
        return False

    _write_retrieval_traces(remaining)
    return True


def delete_retrieval_traces_for_build(build_id: str) -> int:
    records = _load_retrieval_traces()
    remaining = [record for record in records if record.build_id != build_id]
    deleted_count = len(records) - len(remaining)
    if deleted_count > 0:
        _write_retrieval_traces(remaining)
    return deleted_count
