from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .chunking import generate_chunk_preview
from .chunk_runs import delete_chunk_run, get_chunk_run, list_chunk_runs, save_chunk_run
from .content import load_overview
from .document_chunks import get_document_chunk_set, list_document_chunk_sets, save_document_chunk_set
from .documents import delete_document, get_document, list_documents, save_document
from .schemas import (
    ChunkRunCatalogResponse,
    ChunkRunRecord,
    ChunkPreviewRequest,
    ChunkPreviewResponse,
    DocumentChunkSetCatalogResponse,
    DocumentChunkSetRecord,
    DocumentCatalogResponse,
    DocumentRecord,
    RagOverview,
    SaveDocumentChunkSetRequest,
    SaveChunkRunRequest,
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


@app.get("/api/v1/documents/{document_id}/chunk-sets", response_model=DocumentChunkSetCatalogResponse)
def get_document_chunk_sets(document_id: str) -> DocumentChunkSetCatalogResponse:
    document = get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return list_document_chunk_sets(document_id)


@app.post("/api/v1/documents", response_model=DocumentRecord)
def create_document(payload: SaveDocumentRequest) -> DocumentRecord:
    return save_document(payload)


@app.delete("/api/v1/documents/{document_id}")
def remove_document(document_id: str) -> dict[str, str]:
    if document_id.startswith("sample-"):
        raise HTTPException(status_code=400, detail="Sample documents cannot be deleted.")

    deleted = delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"status": "deleted", "id": document_id}


@app.post("/api/v1/documents/{document_id}/chunk-sets", response_model=DocumentChunkSetRecord)
def create_document_chunk_set(document_id: str, payload: SaveDocumentChunkSetRequest) -> DocumentChunkSetRecord:
    record = save_document_chunk_set(document_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return record


@app.get("/api/v1/chunk-runs", response_model=ChunkRunCatalogResponse)
def get_chunk_runs() -> ChunkRunCatalogResponse:
    return list_chunk_runs()


@app.get("/api/v1/chunk-runs/{run_id}", response_model=ChunkRunRecord)
def get_chunk_run_by_id(run_id: str) -> ChunkRunRecord:
    run = get_chunk_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Chunk run not found.")
    return run


@app.get("/api/v1/chunk-sets/{chunk_set_id}", response_model=DocumentChunkSetRecord)
def get_document_chunk_set_by_id(chunk_set_id: str) -> DocumentChunkSetRecord:
    record = get_document_chunk_set(chunk_set_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Document chunk set not found.")
    return record


@app.post("/api/v1/chunk-runs", response_model=ChunkRunRecord)
def create_chunk_run(payload: SaveChunkRunRequest) -> ChunkRunRecord:
    return save_chunk_run(payload)


@app.delete("/api/v1/chunk-runs/{run_id}")
def remove_chunk_run(run_id: str) -> dict[str, str]:
    deleted = delete_chunk_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chunk run not found.")
    return {"status": "deleted", "id": run_id}


@app.post("/api/v1/chunk-preview", response_model=ChunkPreviewResponse)
def preview_chunks(payload: ChunkPreviewRequest) -> ChunkPreviewResponse:
    return generate_chunk_preview(payload)
