from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FlowNode(BaseModel):
    id: str
    title: str
    summary: str
    learningFocus: str
    output: str


class GlossaryItem(BaseModel):
    term: str
    description: str


class DeliveryMilestone(BaseModel):
    name: str
    goal: str
    deliverables: list[str]


class HeroSection(BaseModel):
    title: str
    subtitle: str


class RagOverview(BaseModel):
    hero: HeroSection
    flow: list[FlowNode]
    glossary: list[GlossaryItem]
    sprintOne: list[DeliveryMilestone]


class ChunkRecord(BaseModel):
    id: str
    documentId: str
    text: str
    tokenCount: int
    startOffset: int
    endOffset: int
    metadata: dict[str, str]


class PreviewDocument(BaseModel):
    id: str
    title: str
    sourceType: Literal["txt", "md"]
    charCount: int


class PreviewStats(BaseModel):
    totalChunks: int
    averageChunkLength: int
    requestedChunkSize: int
    requestedChunkOverlap: int


class ChunkPreviewRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    source_type: Literal["txt", "md"] = Field(alias="sourceType")
    content: str = Field(min_length=1)
    chunk_size: int = Field(alias="chunkSize", ge=120, le=1200)
    chunk_overlap: int = Field(alias="chunkOverlap", ge=0, le=400)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Content must not be blank.")
        return value

    @field_validator("chunk_overlap")
    @classmethod
    def validate_overlap(cls, value: int, info) -> int:
        chunk_size = info.data.get("chunk_size")
        if chunk_size is not None and value >= chunk_size:
            raise ValueError("chunkOverlap must be smaller than chunkSize.")
        return value


class ChunkPreviewResponse(BaseModel):
    document: PreviewDocument
    stats: PreviewStats
    chunks: list[ChunkRecord]
