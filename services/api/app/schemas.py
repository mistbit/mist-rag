from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


DocumentSourceType = Literal["txt", "md", "pdf"]
EditableDocumentSourceType = Literal["txt", "md"]
DocumentOrigin = Literal["sample", "saved"]


class DocumentRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    source_type: DocumentSourceType = Field(alias="sourceType")
    content: str
    origin: DocumentOrigin
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    metadata: dict[str, str]


class DocumentSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    source_type: EditableDocumentSourceType = Field(alias="sourceType")
    origin: DocumentOrigin
    excerpt: str
    char_count: int = Field(alias="charCount")
    updated_at: str = Field(alias="updatedAt")


class DocumentCatalogResponse(BaseModel):
    samples: list[DocumentSummary]
    saved: list[DocumentSummary]


class SaveDocumentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1, max_length=120)
    source_type: EditableDocumentSourceType = Field(alias="sourceType")
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def validate_document_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Content must not be blank.")
        return value


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
    sourceType: EditableDocumentSourceType
    charCount: int


class PreviewStats(BaseModel):
    totalChunks: int
    averageChunkLength: int
    requestedChunkSize: int
    requestedChunkOverlap: int


class ChunkPreviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1, max_length=120)
    source_type: EditableDocumentSourceType = Field(alias="sourceType")
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


class SaveChunkRunRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1, max_length=120)
    document_id: str | None = Field(default=None, alias="documentId")
    preview_request: ChunkPreviewRequest = Field(alias="previewRequest")


class ChunkRunSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    document_id: str | None = Field(default=None, alias="documentId")
    total_chunks: int = Field(alias="totalChunks")
    chunk_size: int = Field(alias="chunkSize")
    chunk_overlap: int = Field(alias="chunkOverlap")
    char_count: int = Field(alias="charCount")
    created_at: str = Field(alias="createdAt")


class ChunkRunRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    document_id: str | None = Field(default=None, alias="documentId")
    created_at: str = Field(alias="createdAt")
    preview_request: ChunkPreviewRequest = Field(alias="previewRequest")
    preview_response: ChunkPreviewResponse = Field(alias="previewResponse")


class ChunkRunCatalogResponse(BaseModel):
    runs: list[ChunkRunSummary]


class SaveDocumentChunkSetRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    chunk_size: int = Field(alias="chunkSize", ge=120, le=1200)
    chunk_overlap: int = Field(alias="chunkOverlap", ge=0, le=400)
    label: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=500)

    @field_validator("chunk_overlap")
    @classmethod
    def validate_chunk_set_overlap(cls, value: int, info) -> int:
        chunk_size = info.data.get("chunk_size")
        if chunk_size is not None and value >= chunk_size:
            raise ValueError("chunkOverlap must be smaller than chunkSize.")
        return value

    @field_validator("label", "notes")
    @classmethod
    def normalize_text_field(cls, value: str) -> str:
        return value.strip()


class UpdateDocumentChunkSetRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str = Field(default="", min_length=1, max_length=120)
    notes: str = Field(default="", max_length=500)

    @field_validator("label", "notes")
    @classmethod
    def normalize_update_field(cls, value: str, info) -> str:
        normalized = value.strip()
        if info.field_name == "label" and not normalized:
            raise ValueError("label must not be blank.")
        return normalized


class DocumentChunkSetSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    document_id: str = Field(alias="documentId")
    document_title: str = Field(alias="documentTitle")
    label: str = ""
    notes: str = ""
    total_chunks: int = Field(alias="totalChunks")
    chunk_size: int = Field(alias="chunkSize")
    chunk_overlap: int = Field(alias="chunkOverlap")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class DocumentChunkSetRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    document_id: str = Field(alias="documentId")
    document_title: str = Field(alias="documentTitle")
    label: str = ""
    notes: str = ""
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    preview_request: ChunkPreviewRequest = Field(alias="previewRequest")
    preview_response: ChunkPreviewResponse = Field(alias="previewResponse")


class DocumentChunkSetCatalogResponse(BaseModel):
    sets: list[DocumentChunkSetSummary]


IndexBuildStatus = Literal["ready"]


class CreateIndexBuildRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    embedding_model: str = Field(alias="embeddingModel", default="demo-hash-v1", min_length=1, max_length=80)
    vector_dimensions: int = Field(alias="vectorDimensions", default=12, ge=4, le=64)

    @field_validator("embedding_model")
    @classmethod
    def normalize_embedding_model(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("embeddingModel must not be blank.")
        return normalized


class ChunkVectorRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    chunk_id: str = Field(alias="chunkId")
    token_count: int = Field(alias="tokenCount")
    start_offset: int = Field(alias="startOffset")
    end_offset: int = Field(alias="endOffset")
    values: list[float]


class IndexBuildSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    chunk_set_id: str = Field(alias="chunkSetId")
    document_id: str = Field(alias="documentId")
    document_title: str = Field(alias="documentTitle")
    chunk_set_label: str = Field(alias="chunkSetLabel")
    status: IndexBuildStatus
    embedding_model: str = Field(alias="embeddingModel")
    vector_dimensions: int = Field(alias="vectorDimensions")
    total_vectors: int = Field(alias="totalVectors")
    vocabulary_size: int = Field(alias="vocabularySize")
    average_token_count: int = Field(alias="averageTokenCount")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class IndexBuildRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    chunk_set_id: str = Field(alias="chunkSetId")
    document_id: str = Field(alias="documentId")
    document_title: str = Field(alias="documentTitle")
    chunk_set_label: str = Field(alias="chunkSetLabel")
    status: IndexBuildStatus
    embedding_model: str = Field(alias="embeddingModel")
    vector_dimensions: int = Field(alias="vectorDimensions")
    total_vectors: int = Field(alias="totalVectors")
    vocabulary_size: int = Field(alias="vocabularySize")
    average_token_count: int = Field(alias="averageTokenCount")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    top_terms: list[str] = Field(alias="topTerms")
    chunk_vectors: list[ChunkVectorRecord] = Field(alias="chunkVectors")


class IndexBuildCatalogResponse(BaseModel):
    builds: list[IndexBuildSummary]


class SearchIndexBuildRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str = Field(min_length=1, max_length=200)
    top_k: int = Field(alias="topK", default=3, ge=1, le=8)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank.")
        return normalized


class SearchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    chunk_id: str = Field(alias="chunkId")
    document_id: str = Field(alias="documentId")
    rank: int
    score: float
    text: str
    token_count: int = Field(alias="tokenCount")
    start_offset: int = Field(alias="startOffset")
    end_offset: int = Field(alias="endOffset")


class SearchIndexBuildResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    build_id: str = Field(alias="buildId")
    chunk_set_id: str = Field(alias="chunkSetId")
    document_id: str = Field(alias="documentId")
    document_title: str = Field(alias="documentTitle")
    chunk_set_label: str = Field(alias="chunkSetLabel")
    embedding_model: str = Field(alias="embeddingModel")
    vector_dimensions: int = Field(alias="vectorDimensions")
    query: str
    query_terms: list[str] = Field(alias="queryTerms")
    top_k: int = Field(alias="topK")
    results: list[SearchResult]
