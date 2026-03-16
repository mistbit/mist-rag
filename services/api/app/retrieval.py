from __future__ import annotations

from .document_chunks import get_document_chunk_set
from .index_builds import build_hash_embedding, get_index_build, tokenize_for_embedding
from .schemas import SearchIndexBuildRequest, SearchIndexBuildResponse, SearchResult


def _dot_product(left: list[float], right: list[float]) -> float:
    return round(sum(left_value * right_value for left_value, right_value in zip(left, right, strict=False)), 6)


def search_index_build(build_id: str, payload: SearchIndexBuildRequest) -> SearchIndexBuildResponse | None:
    build = get_index_build(build_id)
    if build is None:
        return None

    chunk_set = get_document_chunk_set(build.chunk_set_id)
    if chunk_set is None:
        return None

    query_terms = tokenize_for_embedding(payload.query)
    query_vector = build_hash_embedding(query_terms, build.vector_dimensions)
    chunk_lookup = {chunk.id: chunk for chunk in chunk_set.preview_response.chunks}

    scored_vectors = [
        (vector, _dot_product(query_vector, vector.values))
        for vector in build.chunk_vectors
    ]
    ranked = [
        (vector, score)
        for vector, score in sorted(scored_vectors, key=lambda item: item[1], reverse=True)
        if score >= payload.score_threshold
    ][: payload.top_k]

    results: list[SearchResult] = []
    for rank, (vector, score) in enumerate(ranked, start=1):
        chunk = chunk_lookup.get(vector.chunk_id)
        if chunk is None:
            continue

        results.append(
            SearchResult(
                chunkId=vector.chunk_id,
                documentId=build.document_id,
                rank=rank,
                score=score,
                text=chunk.text,
                tokenCount=vector.token_count,
                startOffset=vector.start_offset,
                endOffset=vector.end_offset,
            )
        )

    return SearchIndexBuildResponse(
        buildId=build.id,
        chunkSetId=build.chunk_set_id,
        documentId=build.document_id,
        documentTitle=build.document_title,
        chunkSetLabel=build.chunk_set_label,
        embeddingModel=build.embedding_model,
        vectorDimensions=build.vector_dimensions,
        query=payload.query,
        queryTerms=query_terms,
        topK=payload.top_k,
        scoreThreshold=payload.score_threshold,
        results=results,
    )
