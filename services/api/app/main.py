from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .chunking import generate_chunk_preview
from .chunk_runs import delete_chunk_run, get_chunk_run, list_chunk_runs, save_chunk_run
from .comparison_reports import (
    delete_comparison_report,
    get_comparison_report,
    list_comparison_reports,
    render_comparison_report_markdown,
    save_comparison_report,
)
from .content import load_overview
from .document_chunks import (
    delete_document_chunk_set,
    delete_document_chunk_sets_for_document,
    get_document_chunk_set,
    list_document_chunk_sets,
    save_document_chunk_set,
    update_document_chunk_set,
)
from .documents import delete_document, get_document, list_documents, save_document
from .index_builds import create_index_build, delete_index_builds_for_chunk_set, get_index_build, list_index_builds
from .retrieval import search_index_build
from .retrieval_traces import (
    delete_retrieval_trace,
    delete_retrieval_traces_for_build,
    get_retrieval_trace,
    list_retrieval_traces,
    save_retrieval_trace,
)
from .schemas import (
    ChunkRunCatalogResponse,
    ChunkRunRecord,
    ChunkPreviewRequest,
    ChunkPreviewResponse,
    ComparisonReportCatalogResponse,
    ComparisonReportRecord,
    CreateIndexBuildRequest,
    DocumentChunkSetCatalogResponse,
    DocumentChunkSetRecord,
    DocumentCatalogResponse,
    DocumentRecord,
    IndexBuildCatalogResponse,
    IndexBuildRecord,
    RagOverview,
    RetrievalTraceCatalogResponse,
    RetrievalTraceRecord,
    SaveDocumentChunkSetRequest,
    SaveComparisonReportRequest,
    SaveChunkRunRequest,
    SaveDocumentRequest,
    SearchIndexBuildRequest,
    SearchIndexBuildResponse,
    UpdateDocumentChunkSetRequest,
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


@app.get("/api/v1/comparison-reports", response_model=ComparisonReportCatalogResponse)
def get_comparison_report_catalog() -> ComparisonReportCatalogResponse:
    return list_comparison_reports()


@app.get("/api/v1/comparison-reports/{report_id}", response_model=ComparisonReportRecord)
def get_comparison_report_by_id(report_id: str) -> ComparisonReportRecord:
    record = get_comparison_report(report_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Comparison report not found.")
    return record


@app.get("/api/v1/comparison-reports/{report_id}/markdown", response_class=PlainTextResponse)
def get_comparison_report_markdown(report_id: str) -> PlainTextResponse:
    record = get_comparison_report(report_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Comparison report not found.")

    markdown, filename = render_comparison_report_markdown(record)
    return PlainTextResponse(
        markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/v1/comparison-reports", response_model=ComparisonReportRecord)
def create_comparison_report(payload: SaveComparisonReportRequest) -> ComparisonReportRecord:
    return save_comparison_report(payload)


@app.delete("/api/v1/comparison-reports/{report_id}")
def remove_comparison_report(report_id: str) -> dict[str, str]:
    deleted = delete_comparison_report(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Comparison report not found.")
    return {"status": "deleted", "id": report_id}


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

    chunk_set_ids = [summary.id for summary in list_document_chunk_sets(document_id).sets]
    deleted = delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")
    for chunk_set_id in chunk_set_ids:
        build_ids = [summary.id for summary in list_index_builds(chunk_set_id).builds]
        for build_id in build_ids:
            delete_retrieval_traces_for_build(build_id)
        delete_index_builds_for_chunk_set(chunk_set_id)
    delete_document_chunk_sets_for_document(document_id)
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


@app.get("/api/v1/chunk-sets/{chunk_set_id}/index-builds", response_model=IndexBuildCatalogResponse)
def get_chunk_set_index_builds(chunk_set_id: str) -> IndexBuildCatalogResponse:
    record = get_document_chunk_set(chunk_set_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Document chunk set not found.")
    return list_index_builds(chunk_set_id)


@app.post("/api/v1/chunk-sets/{chunk_set_id}/index-builds", response_model=IndexBuildRecord)
def create_chunk_set_index_build(chunk_set_id: str, payload: CreateIndexBuildRequest) -> IndexBuildRecord:
    record = create_index_build(chunk_set_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Document chunk set not found.")
    return record


@app.get("/api/v1/index-builds/{build_id}/retrieval-traces", response_model=RetrievalTraceCatalogResponse)
def get_index_build_traces(build_id: str) -> RetrievalTraceCatalogResponse:
    record = get_index_build(build_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Index build not found.")
    return list_retrieval_traces(build_id)


@app.post("/api/v1/index-builds/{build_id}/retrieval-traces", response_model=RetrievalTraceRecord)
def create_retrieval_trace(build_id: str, payload: SearchIndexBuildRequest) -> RetrievalTraceRecord:
    record = save_retrieval_trace(build_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Index build not found.")
    return record


@app.delete("/api/v1/chunk-sets/{chunk_set_id}")
def remove_document_chunk_set(chunk_set_id: str) -> dict[str, str]:
    build_ids = [summary.id for summary in list_index_builds(chunk_set_id).builds]
    deleted = delete_document_chunk_set(chunk_set_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document chunk set not found.")
    for build_id in build_ids:
        delete_retrieval_traces_for_build(build_id)
    delete_index_builds_for_chunk_set(chunk_set_id)
    return {"status": "deleted", "id": chunk_set_id}


@app.patch("/api/v1/chunk-sets/{chunk_set_id}", response_model=DocumentChunkSetRecord)
def update_chunk_set(chunk_set_id: str, payload: UpdateDocumentChunkSetRequest) -> DocumentChunkSetRecord:
    record = update_document_chunk_set(chunk_set_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail="Document chunk set not found.")
    return record


@app.get("/api/v1/index-builds/{build_id}", response_model=IndexBuildRecord)
def get_index_build_by_id(build_id: str) -> IndexBuildRecord:
    record = get_index_build(build_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Index build not found.")
    return record


@app.post("/api/v1/index-builds/{build_id}/search", response_model=SearchIndexBuildResponse)
def search_index(build_id: str, payload: SearchIndexBuildRequest) -> SearchIndexBuildResponse:
    response = search_index_build(build_id, payload)
    if response is None:
        raise HTTPException(status_code=404, detail="Index build not found.")
    return response


@app.get("/api/v1/retrieval-traces/{trace_id}", response_model=RetrievalTraceRecord)
def get_retrieval_trace_by_id(trace_id: str) -> RetrievalTraceRecord:
    record = get_retrieval_trace(trace_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Retrieval trace not found.")
    return record


@app.delete("/api/v1/retrieval-traces/{trace_id}")
def remove_retrieval_trace(trace_id: str) -> dict[str, str]:
    deleted = delete_retrieval_trace(trace_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Retrieval trace not found.")
    return {"status": "deleted", "id": trace_id}


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
