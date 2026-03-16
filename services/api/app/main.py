from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .chunking import generate_chunk_preview
from .content import load_overview
from .schemas import ChunkPreviewRequest, ChunkPreviewResponse, RagOverview


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


@app.post("/api/v1/chunk-preview", response_model=ChunkPreviewResponse)
def preview_chunks(payload: ChunkPreviewRequest) -> ChunkPreviewResponse:
    return generate_chunk_preview(payload)
