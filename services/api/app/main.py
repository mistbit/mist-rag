from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .chunking import generate_chunk_preview
from .content import load_overview
from .documents import get_document, list_documents, save_document
from .schemas import (
    ChunkPreviewRequest,
    ChunkPreviewResponse,
    DocumentCatalogResponse,
    DocumentRecord,
    RagOverview,
    SaveDocumentRequest,
)


app = FastAPI(
    title="Mist RAG API",
    version="0.1.0",
    description="Sprint 1 API shell for the Mist RAG visual learning platform.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/overview", response_model=RagOverview)
def get_overview() -> RagOverview:
    return load_overview()


@app.get("/api/v1/documents", response_model=DocumentCatalogResponse)
def get_documents() -> DocumentCatalogResponse:
    return list_documents()


@app.get("/api/v1/documents/{document_id}", response_model=DocumentRecord)
def get_document_by_id(document_id: str) -> DocumentRecord:
    document = get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


@app.post("/api/v1/documents", response_model=DocumentRecord)
def create_document(payload: SaveDocumentRequest) -> DocumentRecord:
    return save_document(payload)


@app.post("/api/v1/chunk-preview", response_model=ChunkPreviewResponse)
def preview_chunks(payload: ChunkPreviewRequest) -> ChunkPreviewResponse:
    return generate_chunk_preview(payload)
