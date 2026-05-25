"""
v0.3+ · 本地 Playground 后端
==============================

把第 3 课的 RAG 业务能力（来自 lessons/v03_llm_rag.py）暴露成 HTTP / SSE API，
配合 playground/static 下的网页前端，让你不必再去终端 vi .env 也能：

  • 在网页里输入 / 切换 MIMO_API_KEY（写盘到项目根的 .env，永远不进 git）
  • 跑同一组 query 的 Mock vs 真实 LLM 对比
  • 跑无上下文 vs 有上下文 的幻觉对比
  • 流式接收回答，并实时看到 prompt / completion / reasoning token 与估算成本
  • 单独触发 retrieve，可视化 Top-K 文档与余弦相似度

设计要点：
  1. 后端只监听 127.0.0.1:7860，绝不暴露到局域网 / 公网
  2. Key 不出现在响应体里：GET /api/config 永远只返回脱敏版（前 6 后 4）
  3. 业务零重复：所有 retrieval / build_prompt / llm_chat / llm_chat_stream
     都直接 import 自 lessons.v03_llm_rag，避免双份维护
  4. 错误路径推到 4xx 而非 5xx，前端能拿到 "请先配置 Key" 一类友好提示

启动：
  .venv/bin/python -m playground.server

依赖：
  fastapi, uvicorn[standard]（v0.3+ 段已在 requirements.txt 启用）
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from typing import AsyncGenerator, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ----------------------------------------------------------------------------
# 把项目根加入 sys.path，让我们能直接 import lessons.v03_llm_rag
# ----------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

ENV_PATH = PROJECT_ROOT / ".env"
STATIC_DIR = Path(__file__).resolve().parent / "static"

# 业务模块（首次 import 时会加载 embedding 模型，约 1~2 秒）
from lessons import v03_llm_rag as engine  # noqa: E402

print("[playground] ✅ engine v0.3 已加载")


# ----------------------------------------------------------------------------
# .env 文件读写工具（保持注释、其他行不变）
# ----------------------------------------------------------------------------

_ENV_LOCK = threading.Lock()


def _read_env() -> dict[str, str]:
    """读取 .env -> dict，丢掉空行与注释。"""
    if not ENV_PATH.exists():
        return {}
    out: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _write_env_kv(updates: dict[str, str]) -> None:
    """把若干 key=value 写回 .env：已存在则替换该行，不存在则追加。"""
    with _ENV_LOCK:
        existing = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
        lines = existing.splitlines()

        seen: set[str] = set()
        for i, line in enumerate(lines):
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k = s.split("=", 1)[0].strip()
            if k in updates:
                lines[i] = f"{k}={updates[k]}"
                seen.add(k)

        for k, v in updates.items():
            if k not in seen:
                lines.append(f"{k}={v}")

        ENV_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 12:
        return "*" * len(key)
    return f"{key[:6]}{'*' * (len(key) - 10)}{key[-4:]}"


def _refresh_engine_credentials() -> None:
    """让 engine 模块对最新的 MIMO_API_KEY 等环境变量立即生效。"""
    env = _read_env()
    for k in ("MIMO_API_KEY", "MIMO_BASE_URL", "MIMO_MODEL"):
        if k in env:
            os.environ[k] = env[k]
    engine.MIMO_API_KEY = os.environ.get("MIMO_API_KEY", "")
    engine.MIMO_BASE_URL = os.environ.get("MIMO_BASE_URL", engine.MIMO_BASE_URL)
    engine.MIMO_MODEL = os.environ.get("MIMO_MODEL", engine.MIMO_MODEL)


# 启动时同步一次（兼容用户先在 .env 配好，再启动 playground 的情况）
_refresh_engine_credentials()


# ----------------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------------

class ConfigOut(BaseModel):
    has_key: bool
    key_masked: str
    base_url: str
    model: str


class ConfigIn(BaseModel):
    api_key: Optional[str] = Field(default=None, description="MIMO_API_KEY，留空则不变")
    base_url: Optional[str] = None
    model: Optional[str] = None


class HealthOut(BaseModel):
    ok: bool
    embedding_loaded: bool
    embedding_dim: int
    doc_count: int
    has_key: bool
    base_url: str
    model: str


class RetrieveIn(BaseModel):
    query: str
    top_k: int = Field(default=3, ge=1, le=10)
    score_threshold: float = Field(default=0.30, ge=-1.0, le=1.0)


class RetrievedDoc(BaseModel):
    doc_id: str
    text: str
    similarity: float


class RetrieveOut(BaseModel):
    query: str
    results: List[RetrievedDoc]


class ChatIn(BaseModel):
    query: str
    top_k: int = Field(default=3, ge=1, le=10)
    use_context: bool = True            # False 即"无上下文裸 LLM"
    temperature: float = Field(default=0.3, ge=0.0, le=1.5)
    max_completion_tokens: int = Field(default=1024, ge=1, le=8192)


class ChatStats(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    cached_tokens: int
    total_tokens: int
    elapsed_sec: float
    cost_cny: float


class ChatOut(BaseModel):
    answer: str
    retrieved: List[RetrievedDoc]
    prompt_preview: str
    stats: ChatStats


class MockIn(BaseModel):
    query: str
    top_k: int = 3


class MockOut(BaseModel):
    answer: str
    retrieved: List[RetrievedDoc]


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _retrieve_dto(query: str, top_k: int, threshold: float = 0.30) -> List[RetrievedDoc]:
    raw = engine.retrieve(query, top_k=top_k, score_threshold=threshold)
    return [
        RetrievedDoc(doc_id=doc_id, text=text, similarity=float(sim))
        for (doc_id, text, sim) in raw
    ]


def _stats_to_schema(s: engine.CallStats) -> ChatStats:
    return ChatStats(
        prompt_tokens=s.prompt_tokens,
        completion_tokens=s.completion_tokens,
        reasoning_tokens=s.reasoning_tokens,
        cached_tokens=s.cached_tokens,
        total_tokens=s.total_tokens,
        elapsed_sec=s.elapsed_sec,
        cost_cny=s.cost_cny,
    )


def _build_user_prompt(query: str, retrieved: List[RetrievedDoc], use_context: bool) -> str:
    if not use_context:
        return engine.NO_CONTEXT_USER_PROMPT_TEMPLATE.format(question=query)
    tuples = [(r.doc_id, r.text, r.similarity) for r in retrieved]
    return engine.build_user_prompt(query, tuples)


def _system_prompt_for(use_context: bool) -> str:
    if use_context:
        return engine.SYSTEM_PROMPT
    return "你是一名助手。请直接回答用户问题，不要额外提示需要更多资料。"


# ----------------------------------------------------------------------------
# FastAPI app
# ----------------------------------------------------------------------------

app = FastAPI(
    title="mist-rag · v0.3+ Playground",
    description="本地 RAG 教学 Playground，仅监听 127.0.0.1:7860",
    version="0.3.1",
)


@app.get("/api/health", response_model=HealthOut)
def api_health() -> HealthOut:
    _refresh_engine_credentials()
    dim = int(engine.DOC_MATRIX.shape[1])
    return HealthOut(
        ok=True,
        embedding_loaded=True,
        embedding_dim=dim,
        doc_count=int(engine.DOC_MATRIX.shape[0]),
        has_key=bool(engine.MIMO_API_KEY),
        base_url=engine.MIMO_BASE_URL,
        model=engine.MIMO_MODEL,
    )


@app.get("/api/config", response_model=ConfigOut)
def api_config_get() -> ConfigOut:
    _refresh_engine_credentials()
    return ConfigOut(
        has_key=bool(engine.MIMO_API_KEY),
        key_masked=_mask_key(engine.MIMO_API_KEY),
        base_url=engine.MIMO_BASE_URL,
        model=engine.MIMO_MODEL,
    )


_KEY_RE = re.compile(r"^sk-[A-Za-z0-9_\-]{8,}$")


@app.post("/api/config", response_model=ConfigOut)
def api_config_post(payload: ConfigIn) -> ConfigOut:
    updates: dict[str, str] = {}
    if payload.api_key is not None:
        key = payload.api_key.strip()
        if key and not _KEY_RE.match(key):
            raise HTTPException(
                status_code=400,
                detail="MIMO_API_KEY 看起来不像合法 Key（应以 sk- 开头）。请检查后再试。",
            )
        updates["MIMO_API_KEY"] = key
    if payload.base_url is not None and payload.base_url.strip():
        updates["MIMO_BASE_URL"] = payload.base_url.strip()
    if payload.model is not None and payload.model.strip():
        updates["MIMO_MODEL"] = payload.model.strip()

    if updates:
        _write_env_kv(updates)
        _refresh_engine_credentials()

    return ConfigOut(
        has_key=bool(engine.MIMO_API_KEY),
        key_masked=_mask_key(engine.MIMO_API_KEY),
        base_url=engine.MIMO_BASE_URL,
        model=engine.MIMO_MODEL,
    )


@app.post("/api/retrieve", response_model=RetrieveOut)
def api_retrieve(payload: RetrieveIn) -> RetrieveOut:
    docs = _retrieve_dto(payload.query, payload.top_k, payload.score_threshold)
    return RetrieveOut(query=payload.query, results=docs)


@app.post("/api/mock", response_model=MockOut)
def api_mock(payload: MockIn) -> MockOut:
    docs = _retrieve_dto(payload.query, payload.top_k)
    answer = engine.mock_llm(payload.query, [(d.doc_id, d.text, d.similarity) for d in docs])
    return MockOut(answer=answer, retrieved=docs)


def _ensure_key() -> None:
    _refresh_engine_credentials()
    if not engine.MIMO_API_KEY:
        raise HTTPException(
            status_code=412,
            detail="尚未配置 MIMO_API_KEY。请在网页顶部「⚙️ 配置 API Key」处填入后再试。",
        )


@app.post("/api/chat", response_model=ChatOut)
def api_chat(payload: ChatIn) -> ChatOut:
    _ensure_key()
    docs = _retrieve_dto(payload.query, payload.top_k)
    user_prompt = _build_user_prompt(payload.query, docs, payload.use_context)
    system_prompt = _system_prompt_for(payload.use_context)
    try:
        answer, stats = engine.llm_chat(
            user_prompt,
            system_prompt=system_prompt,
            temperature=payload.temperature,
            max_completion_tokens=payload.max_completion_tokens,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"调用 MiMo 失败：{type(e).__name__}: {e}")

    return ChatOut(
        answer=answer,
        retrieved=docs,
        prompt_preview=user_prompt,
        stats=_stats_to_schema(stats),
    )


def _sse_pack(event: str, data: dict) -> bytes:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


@app.post("/api/chat/stream")
async def api_chat_stream(payload: ChatIn) -> StreamingResponse:
    _ensure_key()
    docs = _retrieve_dto(payload.query, payload.top_k)
    user_prompt = _build_user_prompt(payload.query, docs, payload.use_context)
    system_prompt = _system_prompt_for(payload.use_context)

    async def gen() -> AsyncGenerator[bytes, None]:
        # 1. 先把检索结果丢给前端
        yield _sse_pack(
            "retrieved",
            {
                "query": payload.query,
                "results": [d.model_dump() for d in docs],
                "prompt_preview": user_prompt,
            },
        )

        client = engine.get_client()
        t0 = time.perf_counter()
        try:
            stream = client.chat.completions.create(
                model=engine.MIMO_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=payload.temperature,
                max_completion_tokens=payload.max_completion_tokens,
                stream=True,
                stream_options={"include_usage": True},
            )
        except Exception as e:  # noqa: BLE001
            yield _sse_pack("error", {"message": f"{type(e).__name__}: {e}"})
            return

        usage_obj = None
        try:
            for chunk in stream:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    piece = getattr(delta, "content", None)
                    if piece:
                        yield _sse_pack("delta", {"content": piece})
                if getattr(chunk, "usage", None) is not None:
                    usage_obj = chunk.usage
        except Exception as e:  # noqa: BLE001
            yield _sse_pack("error", {"message": f"流式中断：{type(e).__name__}: {e}"})
            return

        elapsed = time.perf_counter() - t0
        if usage_obj is not None:
            stats = engine._extract_stats(usage_obj, elapsed)
            yield _sse_pack("done", {"stats": _stats_to_schema(stats).model_dump()})
        else:
            yield _sse_pack("done", {"stats": None})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ----------------------------------------------------------------------------
# 静态资源（必须放在所有 /api/* 路由之后）
# ----------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


# ----------------------------------------------------------------------------
# Entry
# ----------------------------------------------------------------------------

def main() -> None:
    import uvicorn

    host = os.environ.get("PLAYGROUND_HOST", "127.0.0.1")
    port = int(os.environ.get("PLAYGROUND_PORT", "7860"))
    print(f"[playground] 🚀 listening on http://{host}:{port}")
    uvicorn.run(
        "playground.server:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
