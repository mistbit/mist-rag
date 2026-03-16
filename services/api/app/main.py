from __future__ import annotations

from fastapi import FastAPI

from .content import load_overview
from .schemas import RagOverview


app = FastAPI(
    title="Mist RAG API",
    version="0.1.0",
    description="Sprint 1 API shell for the Mist RAG visual learning platform.",
)


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/overview", response_model=RagOverview)
def get_overview() -> RagOverview:
    return load_overview()

