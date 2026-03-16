from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .documents import STORAGE_DIR
from .schemas import (
    ComparisonConclusionCard,
    ComparisonReportCatalogResponse,
    ComparisonReportRecord,
    ComparisonReportSummary,
    ComparisonSnapshot,
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


def _sanitize_filename(title: str) -> str:
    cleaned = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in title.strip())
    compact = "-".join(part for part in cleaned.split("-") if part)
    return compact[:80] or "comparison-report"


def _build_rank_rows(record: ComparisonReportRecord) -> list[dict[str, object]]:
    slot_a_search = record.slot_a.search
    slot_b_search = record.slot_b.search
    if not slot_a_search or not slot_b_search:
        return []

    row_count = max(len(slot_a_search.top_results), len(slot_b_search.top_results))
    rows: list[dict[str, object]] = []
    for index in range(row_count):
        slot_a = slot_a_search.top_results[index] if index < len(slot_a_search.top_results) else None
        slot_b = slot_b_search.top_results[index] if index < len(slot_b_search.top_results) else None
        rows.append(
            {
                "rank": index + 1,
                "slot_a": slot_a,
                "slot_b": slot_b,
                "same_chunk": bool(slot_a and slot_b and slot_a.chunk_id == slot_b.chunk_id),
                "score_delta": slot_b.score - slot_a.score if slot_a and slot_b else None,
            }
        )
    return rows


def _render_conclusions(cards: list[ComparisonConclusionCard]) -> list[str]:
    lines = ["## 结论摘要", ""]
    for card in cards:
        lines.append(f"### {card.label} · {card.title}")
        lines.append(card.body)
        lines.append("")
    return lines


def _render_slot_snapshot(slot: ComparisonSnapshot) -> list[str]:
    lines = [
        f"## Slot {slot.slot_id}",
        "",
        f"- 文档: {slot.document_title}",
        f"- 预设: {slot.preset_label}",
        f"- Chunk: {slot.chunk_size}/{slot.chunk_overlap}",
        f"- 总 chunks: {slot.total_chunks}",
        f"- 平均长度: {slot.average_chunk_length}",
        f"- 字符数: {slot.char_count}",
        f"- Chunk set: {slot.chunk_set_label or '未保存'}",
        f"- 索引: {slot.embedding_model or '未建立'}",
    ]

    if not slot.search:
        lines.extend(["", "- 检索: 未运行", ""])
        return lines

    lines.extend(
        [
            f"- Query: {slot.search.query}",
            f"- Top K: {slot.search.top_k}",
            f"- Threshold: {slot.search.score_threshold:.2f}",
            f"- 结果数: {slot.search.result_count}",
            f"- Top score: {slot.search.top_score:.4f}" if slot.search.top_score is not None else "- Top score: 无",
            f"- Query terms: {' / '.join(slot.search.query_terms) if slot.search.query_terms else '无'}",
            "",
            "### Top Hits",
            "",
        ]
    )

    for result in slot.search.top_results:
        lines.extend(
            [
                f"- Rank {result.rank} | score {result.score:.4f} | chunk {result.chunk_id}",
                f"  - offset {result.start_offset}-{result.end_offset}, {result.token_count} tokens",
                f"  - {result.text}",
            ]
        )

    lines.append("")
    return lines


def render_comparison_report_markdown(record: ComparisonReportRecord) -> tuple[str, str]:
    summary = _to_summary(record)
    lines = [
        f"# {record.title}",
        "",
        f"- 创建时间: {record.created_at}",
        f"- 文档: {record.document_title}",
        f"- Chunk 差值: {summary.chunk_delta:+d}",
        f"- 检索差值: {summary.search_delta:+d}" if summary.search_delta is not None else "- 检索差值: 未形成 A/B 检索对照",
        (
            f"- Rank 稳定度: {summary.stable_rank_count}/{summary.compared_rank_count}"
            if summary.stable_rank_count is not None and summary.compared_rank_count is not None
            else "- Rank 稳定度: 未形成 A/B 检索对照"
        ),
        "",
    ]

    lines.extend(_render_conclusions(record.conclusions))
    lines.extend(_render_slot_snapshot(record.slot_a))
    lines.extend(_render_slot_snapshot(record.slot_b))

    rank_rows = _build_rank_rows(record)
    if rank_rows:
        lines.extend(["## Rank Compare", "", "| Rank | Slot A | Slot B | 稳定度 | 分数差 (B-A) |", "| --- | --- | --- | --- | --- |"])
        for row in rank_rows:
            slot_a = row["slot_a"]
            slot_b = row["slot_b"]
            slot_a_label = f"{slot_a.chunk_id} ({slot_a.score:.4f})" if slot_a else "无"
            slot_b_label = f"{slot_b.chunk_id} ({slot_b.score:.4f})" if slot_b else "无"
            score_delta = row["score_delta"]
            lines.append(
                f"| {row['rank']} | {slot_a_label} | {slot_b_label} | {'same chunk' if row['same_chunk'] else 'shifted'} | "
                f"{f'{score_delta:+.4f}' if score_delta is not None else '—'} |"
            )
        lines.append("")

    return "\n".join(lines).strip() + "\n", f"{_sanitize_filename(record.title)}.md"


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
