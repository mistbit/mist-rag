"""
v0.3 - 接入真实 LLM（小米 MiMo-V2.5-Pro）的 RAG
=================================================

教程：第 3 课
配套讲义：docs/lessons/lesson-03-llm-rag.md

本程序的目标：
    在 v0.2（embedding 检索）的骨架上，把 mock_llm() 换成对小米
    MiMo-V2.5-Pro 的真实 API 调用。这是 RAG 真正"跑起来"的第一版。

    我们演示 4 种关键场景，每一种都对应一个面试 / 工程上的核心争论：

      [demo=compare-mock]   同一 query，mock_llm vs 真实 LLM 输出对照
      [demo=hallucination]  同一 query，无上下文 vs 有上下文 的幻觉对比
      [demo=usage]          打印 prompt_tokens / completion_tokens 与估算成本
      [demo=stream]         流式输出（SSE），逐 chunk 打印体验

依赖：
    openai>=1.30.0
    python-dotenv>=1.0.0
    （以及 v0.2 的 sentence-transformers / numpy）

环境变量：
    MIMO_API_KEY=sk-xxx          # 必填
    MIMO_BASE_URL=https://api.xiaomimimo.com/v1
    MIMO_MODEL=mimo-v2.5-pro

运行：
    python lessons/v03_llm_rag.py                    # 跑全部 4 个 demo
    python lessons/v03_llm_rag.py compare-mock       # 只跑 mock vs llm
    python lessons/v03_llm_rag.py hallucination
    python lessons/v03_llm_rag.py usage
    python lessons/v03_llm_rag.py stream
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
from dotenv import load_dotenv
from openai import OpenAI
from sentence_transformers import SentenceTransformer


# ============================================================
# 0) 加载环境变量（.env -> os.environ）
# ============================================================

load_dotenv()

MIMO_API_KEY = os.getenv("MIMO_API_KEY", "")
MIMO_BASE_URL = os.getenv("MIMO_BASE_URL", "https://api.xiaomimimo.com/v1")
MIMO_MODEL = os.getenv("MIMO_MODEL", "mimo-v2.5-pro")


# ============================================================
# 1) 知识库（与 v0.1 / v0.2 完全相同，便于跨课对比）
# ============================================================

KNOWLEDGE_BASE: Dict[str, str] = {
    "doc-001": (
        "RAG 是 Retrieval-Augmented Generation 的缩写，"
        "即检索增强生成。它的核心思想是在大语言模型回答问题前，"
        "先从知识库中检索相关资料，再把资料与问题一起交给模型生成答案。"
    ),
    "doc-002": (
        "向量数据库用于存储 embedding 向量，并支持基于相似度的检索。"
        "常见的向量数据库有 Chroma、FAISS、Milvus、Qdrant 等。"
    ),
    "doc-003": (
        "BM25 是一种经典的稀疏检索算法，基于词频与逆文档频率。"
        "它在精确关键词匹配场景中表现优秀，常作为混合检索的一路通道。"
    ),
    "doc-004": (
        "Embedding 模型可以把一段文本映射为高维向量，使得语义相近的文本"
        "在向量空间中距离也接近。常见的中文 embedding 模型有 bge、m3e 等。"
    ),
    "doc-005": (
        "小米发布了 MiMo-V2.5-Pro 模型，支持 OpenAI 兼容 API，"
        "默认开启思考模式，会返回 reasoning_content 字段。"
    ),
    "doc-006": (
        "Apple 公司目前的 CEO 是 Tim Cook，他在 2011 年接替 Steve Jobs。"
        "Apple 总部位于美国加州库比蒂诺。"
    ),
}


# ============================================================
# 2) Embedding（沿用 v0.2 的实现）
# ============================================================

EMBED_MODEL_NAME = "BAAI/bge-small-zh-v1.5"

print(f"[v0.3] 正在加载 embedding 模型：{EMBED_MODEL_NAME} ...")
_embedder = SentenceTransformer(EMBED_MODEL_NAME)
print(f"[v0.3] ✅ embedding 模型加载完毕")


def embed(texts: List[str]) -> np.ndarray:
    return _embedder.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )


DOC_IDS: List[str] = list(KNOWLEDGE_BASE.keys())
DOC_TEXTS: List[str] = [KNOWLEDGE_BASE[d] for d in DOC_IDS]
DOC_MATRIX: np.ndarray = embed(DOC_TEXTS)
print(f"[v0.3] ✅ 文档矩阵 shape = {DOC_MATRIX.shape}")
print()


def retrieve(
    query: str,
    top_k: int = 3,
    score_threshold: float = 0.30,
) -> List[Tuple[str, str, float]]:
    q_vec = embed([query])[0]
    sims = DOC_MATRIX @ q_vec
    top_idx = np.argsort(sims)[::-1][:top_k]
    results: List[Tuple[str, str, float]] = []
    for i in top_idx:
        sim = float(sims[i])
        if sim < score_threshold:
            break
        results.append((DOC_IDS[i], DOC_TEXTS[i], sim))
    return results


# ============================================================
# 3) Prompt 模板
#    这一版我们做了三处工程级强化：
#      1. system prompt 写明角色 + "未知则坦白"约束
#      2. 资料块用 <doc-xxx | sim=...> 标注，便于 LLM 引用
#      3. 不附带任何"以下信息可能不准"的弱化语，避免 LLM 自我怀疑
# ============================================================

SYSTEM_PROMPT = (
    "你是一名严谨的 RAG 助手。请严格基于【参考资料】回答用户问题。\n"
    "若资料无法支撑答案，请如实回答“资料中没有相关信息”，绝对不要编造。\n"
    "回答时要简洁、直接，并在引用事实后用 (doc-xxx) 标注来源。"
)

USER_PROMPT_TEMPLATE = """\
[参考资料]
{context}

[用户问题]
{question}
"""

NO_CONTEXT_USER_PROMPT_TEMPLATE = """\
[用户问题]
{question}
"""


def build_user_prompt(query: str, retrieved: List[Tuple[str, str, float]]) -> str:
    if not retrieved:
        context = "（未检索到任何相关资料）"
    else:
        context = "\n".join(
            f"<{doc_id} | sim={sim:.3f}> {text}"
            for doc_id, text, sim in retrieved
        )
    return USER_PROMPT_TEMPLATE.format(context=context, question=query)


# ============================================================
# 4) LLM Client（OpenAI 兼容协议 -> MiMo Endpoint）
# ============================================================

def get_client() -> OpenAI:
    if not MIMO_API_KEY:
        raise RuntimeError(
            "环境变量 MIMO_API_KEY 未设置。\n"
            "请执行：cp .env.example .env，然后把 .env 里的 sk-xxx 换成真实 Key。"
        )
    return OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_BASE_URL)


# ============================================================
# 5) Token 计费小工具
#    依据 https://platform.xiaomimimo.com/docs/zh-CN/pricing
#    （国内定价，输入 ≤ 256K 上下文区间）
#      mimo-v2.5-pro：
#        - 输入未命中缓存：¥7.00 / 1M tokens
#        - 输入命中缓存：  ¥1.40 / 1M tokens
#        - 输出：          ¥21.00 / 1M tokens
#    本课的小知识库一定不会触发缓存，全部按"未命中"计算（保守估计）
# ============================================================

PRICE_PER_1M_INPUT_MISS = 7.00     # CNY
PRICE_PER_1M_INPUT_HIT = 1.40      # CNY
PRICE_PER_1M_OUTPUT = 21.00        # CNY


@dataclass
class CallStats:
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    cached_tokens: int
    total_tokens: int
    elapsed_sec: float

    @property
    def cost_cny(self) -> float:
        miss = max(self.prompt_tokens - self.cached_tokens, 0)
        hit = self.cached_tokens
        cost_in = (miss * PRICE_PER_1M_INPUT_MISS + hit * PRICE_PER_1M_INPUT_HIT) / 1_000_000
        cost_out = self.completion_tokens * PRICE_PER_1M_OUTPUT / 1_000_000
        return cost_in + cost_out

    def pretty(self) -> str:
        return (
            f"prompt={self.prompt_tokens} (cached={self.cached_tokens}) | "
            f"completion={self.completion_tokens} (reasoning={self.reasoning_tokens}) | "
            f"total={self.total_tokens} | "
            f"elapsed={self.elapsed_sec:.2f}s | "
            f"≈¥{self.cost_cny:.6f}"
        )


def _extract_stats(usage, elapsed_sec: float) -> CallStats:
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    total_tokens = getattr(usage, "total_tokens", 0) or 0

    reasoning_tokens = 0
    completion_details = getattr(usage, "completion_tokens_details", None)
    if completion_details is not None:
        reasoning_tokens = getattr(completion_details, "reasoning_tokens", 0) or 0

    cached_tokens = 0
    prompt_details = getattr(usage, "prompt_tokens_details", None)
    if prompt_details is not None:
        cached_tokens = getattr(prompt_details, "cached_tokens", 0) or 0

    return CallStats(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        reasoning_tokens=reasoning_tokens,
        cached_tokens=cached_tokens,
        total_tokens=total_tokens,
        elapsed_sec=elapsed_sec,
    )


# ============================================================
# 6) LLM 调用：非流式 / 流式 两种实现
# ============================================================

def llm_chat(
    user_prompt: str,
    system_prompt: str = SYSTEM_PROMPT,
    temperature: float = 0.3,
    max_completion_tokens: int = 1024,
) -> Tuple[str, CallStats]:
    """非流式调用，返回 (回答文本, 用量统计)。"""
    client = get_client()
    t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=MIMO_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_completion_tokens=max_completion_tokens,
        stream=False,
    )
    elapsed = time.perf_counter() - t0

    answer = resp.choices[0].message.content or ""
    stats = _extract_stats(resp.usage, elapsed)
    return answer, stats


def llm_chat_stream(
    user_prompt: str,
    system_prompt: str = SYSTEM_PROMPT,
    temperature: float = 0.3,
    max_completion_tokens: int = 1024,
) -> Tuple[str, Optional[CallStats]]:
    """流式调用，逐 chunk 打印到 stdout，返回 (拼接后的回答, 用量统计)。"""
    client = get_client()
    t0 = time.perf_counter()
    stream = client.chat.completions.create(
        model=MIMO_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_completion_tokens=max_completion_tokens,
        stream=True,
        stream_options={"include_usage": True},
    )

    parts: List[str] = []
    usage = None
    for chunk in stream:
        if chunk.choices:
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                parts.append(piece)
                sys.stdout.write(piece)
                sys.stdout.flush()
        if getattr(chunk, "usage", None) is not None:
            usage = chunk.usage
    sys.stdout.write("\n")

    elapsed = time.perf_counter() - t0
    stats = _extract_stats(usage, elapsed) if usage is not None else None
    return "".join(parts), stats


# ============================================================
# 7) Mock LLM（v0.2 完全相同的实现，用于对照）
# ============================================================

def mock_llm(query: str, retrieved: List[Tuple[str, str, float]]) -> str:
    if not retrieved:
        return "[Mock LLM] 我不知道（未检索到相关资料）"
    return (
        f"[Mock LLM] 收到问题：{query}\n"
        f"[Mock LLM] 我看到了 {len(retrieved)} 篇相关资料。\n"
        f"[Mock LLM] 基于这些资料，我会综合给出回答（这是 mock，不是真模型）。"
    )


# ============================================================
# 8) 4 个 Demo
# ============================================================

def _print_retrieval(query: str, retrieved: List[Tuple[str, str, float]]) -> None:
    print(f"❓ 用户问题：{query}")
    print("🔎 向量检索 Top-K：")
    if not retrieved:
        print("   （所有候选都低于阈值，无命中）")
    for doc_id, text, sim in retrieved:
        preview = text[:40] + ("..." if len(text) > 40 else "")
        print(f"   - {doc_id} (sim={sim:.3f}) → {preview}")


def demo_compare_mock(query: str = "什么是 RAG？") -> None:
    """场景一：同一 query 在 mock vs 真实 LLM 上的差异。"""
    print("=" * 70)
    print("【Demo 1】Mock LLM  vs  真实 MiMo-V2.5-Pro")
    print("=" * 70)
    retrieved = retrieve(query, top_k=3)
    _print_retrieval(query, retrieved)

    print("\n--- 🪨 Mock LLM 输出 ---")
    print(mock_llm(query, retrieved))

    print("\n--- 🤖 真实 LLM 输出 ---")
    user_prompt = build_user_prompt(query, retrieved)
    answer, stats = llm_chat(user_prompt)
    print(answer)
    print(f"\n📊 {stats.pretty()}")
    print()


def demo_hallucination(query: str = "什么是 RAG？") -> None:
    """场景二：无上下文 vs 有上下文，看 LLM 在事实问题上的幻觉差异。

    我们故意挑一个 query，让 LLM 在"无上下文"时几乎一定要靠"内部知识"回答 —
    然后再注入我们 KB 里的资料对比。
    """
    print("=" * 70)
    print("【Demo 2】幻觉对比：无上下文 vs 有上下文")
    print("=" * 70)
    retrieved = retrieve(query, top_k=3)
    _print_retrieval(query, retrieved)

    print("\n--- ❌ 不给上下文（裸 LLM）---")
    bare_prompt = NO_CONTEXT_USER_PROMPT_TEMPLATE.format(question=query)
    answer_bare, stats_bare = llm_chat(bare_prompt, system_prompt=(
        "你是一名助手。请直接回答用户问题，不要额外提示需要更多资料。"
    ))
    print(answer_bare)
    print(f"📊 {stats_bare.pretty()}")

    print("\n--- ✅ 给上下文（RAG）---")
    rag_prompt = build_user_prompt(query, retrieved)
    answer_rag, stats_rag = llm_chat(rag_prompt)
    print(answer_rag)
    print(f"📊 {stats_rag.pretty()}")
    print()


def demo_usage(queries: Optional[List[str]] = None) -> None:
    """场景三：对一组 query 跑一遍，打印 token 用量与累计成本。"""
    if queries is None:
        queries = [
            "什么是 RAG？",
            "BM25 是什么？",
            "苹果公司的 CEO 是谁？",
        ]

    print("=" * 70)
    print("【Demo 3】Token 用量与成本统计")
    print("=" * 70)

    total_prompt = 0
    total_completion = 0
    total_cost = 0.0
    total_elapsed = 0.0

    for q in queries:
        retrieved = retrieve(q, top_k=3)
        prompt = build_user_prompt(q, retrieved)
        answer, stats = llm_chat(prompt, max_completion_tokens=512)
        print(f"❓ {q}")
        print(f"   → {answer.splitlines()[0][:80]} ...")
        print(f"   📊 {stats.pretty()}")
        total_prompt += stats.prompt_tokens
        total_completion += stats.completion_tokens
        total_cost += stats.cost_cny
        total_elapsed += stats.elapsed_sec
        print()

    print("-" * 70)
    print(
        f"📦 累计：prompt={total_prompt} | completion={total_completion} | "
        f"elapsed={total_elapsed:.2f}s | ≈¥{total_cost:.6f}"
    )
    print(
        "💡 估算口径：mimo-v2.5-pro 国内未命中缓存价 ¥7/1M（输入），¥21/1M（输出）"
    )
    print()


def demo_stream(query: str = "请用 3 句话讲清楚 RAG 的核心思想。") -> None:
    """场景四：流式输出体验。逐 chunk 打印，最后一帧带 usage。"""
    print("=" * 70)
    print("【Demo 4】流式输出（stream=True）")
    print("=" * 70)
    retrieved = retrieve(query, top_k=3)
    _print_retrieval(query, retrieved)
    print("\n--- 🌊 Streaming ---")
    user_prompt = build_user_prompt(query, retrieved)
    _answer, stats = llm_chat_stream(user_prompt)
    if stats is not None:
        print(f"\n📊 {stats.pretty()}")
    print()


# ============================================================
# 9) 入口
# ============================================================

DEMOS = {
    "compare-mock": demo_compare_mock,
    "hallucination": demo_hallucination,
    "usage": demo_usage,
    "stream": demo_stream,
}


def main() -> None:
    if len(sys.argv) > 1:
        name = sys.argv[1]
        if name not in DEMOS:
            print(f"未知 demo：{name}，可选：{list(DEMOS)}")
            sys.exit(1)
        DEMOS[name]()
        return

    for name, fn in DEMOS.items():
        print(f"\n############  RUNNING DEMO: {name}  ############\n")
        fn()


if __name__ == "__main__":
    main()
