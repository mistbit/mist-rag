from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .documents import STORAGE_DIR
from .schemas import (
    ComparisonReportCatalogResponse,
    ComparisonReportRecord,
    ComparisonReportSummary,
    SaveComparisonReportRequest,
)


COMPARISON_REPORTS_PATH = STORAGE_DIR / "comparison_reports.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_comparison_reports() -> list[ComparisonReportRecord]:
    if not COMPARISON_REPORTS_PATH.exists():
        return []

    with COMPARISON_REPORTS_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return [ComparisonReportRecord.model_validate(item) for item in payload]


def _write_comparison_reports(records: list[ComparisonReportRecord]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with COMPARISON_REPORTS_PATH.open("w", encoding="utf-8") as file:
        json.dump([record.model_dump(by_alias=True) for record in records], file, ensure_ascii=False, indent=2)


def _to_summary(record: ComparisonReportRecord) -> ComparisonReportSummary:
    slot_a = record.slot_a
    slot_b = record.slot_b
    has_search_pair = bool(slot_a.search and slot_b.search)
    search_delta = None
    stable_rank_count = None
    compared_rank_count = None

    if slot_a.search and slot_b.search:
        search_delta = slot_b.search.result_count - slot_a.search.result_count
        compared_rank_count = max(len(slot_a.search.top_results), len(slot_b.search.top_results))
        stable_rank_count = sum(
            1
            for index in range(compared_rank_count)
            if index < len(slot_a.search.top_results)
            and index < len(slot_b.search.top_results)
            and slot_a.search.top_results[index].chunk_id == slot_b.search.top_results[index].chunk_id
        )

    return ComparisonReportSummary(
        id=record.id,
        title=record.title,
        documentTitle=record.document_title,
        createdAt=record.created_at,
        hasSearchPair=has_search_pair,
        chunkDelta=slot_b.total_chunks - slot_a.total_chunks,
        searchDelta=search_delta,
        stableRankCount=stable_rank_count,
        comparedRankCount=compared_rank_count,
        leadConclusion=record.conclusions[0].title if record.conclusions else "未生成结论",
    )


def list_comparison_reports() -> ComparisonReportCatalogResponse:
    records = sorted(_load_comparison_reports(), key=lambda item: item.created_at, reverse=True)
    return ComparisonReportCatalogResponse(reports=[_to_summary(record) for record in records])


def get_comparison_report(report_id: str) -> ComparisonReportRecord | None:
    for record in _load_comparison_reports():
        if record.id == report_id:
            return record
    return None


def save_comparison_report(payload: SaveComparisonReportRequest) -> ComparisonReportRecord:
    record = ComparisonReportRecord(
        id=f"compare-{uuid.uuid4().hex[:10]}",
        title=payload.title,
        documentTitle=payload.slot_b.document_title or payload.slot_a.document_title,
        createdAt=_utc_now(),
        slotA=payload.slot_a,
        slotB=payload.slot_b,
        conclusions=payload.conclusions,
    )

    records = _load_comparison_reports()
    records.append(record)
    _write_comparison_reports(records)
    return record


def delete_comparison_report(report_id: str) -> bool:
    records = _load_comparison_reports()
    remaining = [record for record in records if record.id != report_id]
    if len(remaining) == len(records):
        return False

    _write_comparison_reports(remaining)
    return True
