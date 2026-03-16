from __future__ import annotations

import math

from .schemas import ChunkPreviewRequest, ChunkPreviewResponse, ChunkRecord, PreviewDocument, PreviewStats


def _normalize_text(content: str) -> str:
    return content.replace("\r\n", "\n").strip()


def _estimate_token_count(text: str) -> int:
    return len(text.split())


def _find_chunk_end(text: str, start: int, chunk_size: int) -> int:
    hard_end = min(start + chunk_size, len(text))
    if hard_end == len(text):
        return hard_end

    search_start = min(hard_end, start + max(chunk_size // 2, 1))
    candidates = (
        text.rfind("\n\n", search_start, hard_end),
        text.rfind("\n", search_start, hard_end),
        text.rfind(" ", search_start, hard_end),
    )

    for candidate in candidates:
        if candidate > start:
            return candidate

    return hard_end


def _align_chunk_start(text: str, start: int) -> int:
    if start <= 0 or start >= len(text):
        return start

    if text[start].isspace() or text[start - 1].isspace():
        return start

    while start > 0 and not text[start - 1].isspace():
        start -= 1

    return start


def generate_chunk_preview(payload: ChunkPreviewRequest) -> ChunkPreviewResponse:
    content = _normalize_text(payload.content)
    if not content:
        raise ValueError("Content must not be empty after trimming whitespace.")

    if payload.chunk_overlap >= payload.chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size.")

    document_id = "preview-doc"
    chunks: list[ChunkRecord] = []
    start = 0
    index = 1

    while start < len(content):
        end = _find_chunk_end(content, start, payload.chunk_size)

        chunk_start = start
        while chunk_start < end and content[chunk_start].isspace():
            chunk_start += 1

        chunk_end = end
        while chunk_end > chunk_start and content[chunk_end - 1].isspace():
            chunk_end -= 1

        if chunk_end <= chunk_start:
            start = max(start + 1, end)
            continue

        chunk_text = content[chunk_start:chunk_end]
        chunks.append(
            ChunkRecord(
                id=f"{document_id}-chunk-{index:03d}",
                documentId=document_id,
                text=chunk_text,
                tokenCount=_estimate_token_count(chunk_text),
                startOffset=chunk_start,
                endOffset=chunk_end,
                metadata={"source_doc": payload.title},
            )
        )

        if end >= len(content):
            break

        next_start = max(chunk_end - payload.chunk_overlap, chunk_start + 1)
        next_start = max(_align_chunk_start(content, next_start), chunk_start + 1)
        start = next_start
        index += 1

    average_chunk_length = 0 if not chunks else math.ceil(sum(len(chunk.text) for chunk in chunks) / len(chunks))

    return ChunkPreviewResponse(
        document=PreviewDocument(
            id=document_id,
            title=payload.title,
            sourceType=payload.source_type,
            charCount=len(content),
        ),
        stats=PreviewStats(
            totalChunks=len(chunks),
            averageChunkLength=average_chunk_length,
            requestedChunkSize=payload.chunk_size,
            requestedChunkOverlap=payload.chunk_overlap,
        ),
        chunks=chunks,
    )
