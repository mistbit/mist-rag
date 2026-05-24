"""
v0.2 - Embedding 向量检索 RAG
==============================

教程：第 2 课
配套讲义：docs/lessons/lesson-02-embedding-rag.md

本程序的目标：
    在 v0.1 的骨架（retrieve -> augment -> generate）基础上，
    只替换 retrieve() 一个函数 —— 把"关键词命中数"换成
    "句向量 + 余弦相似度"，让 RAG 真正具备语义检索能力。

    我们沿用 v0.1 完全相同的 KNOWLEDGE_BASE 与 5 个 demo query，
    重点观察：
        ❌ v0.1：「苹果公司的 CEO 是谁？」→ 关键词法 0 命中
        ✅ v0.2：「苹果公司的 CEO 是谁？」→ Top-1 命中 doc-006（Apple Tim Cook）

    这就是 Embedding 带来的核心增益：跨语言 / 同义 / 上下位的语义匹配。

依赖：
    sentence-transformers>=2.7.0
    numpy>=1.26.0

运行：
    python lessons/v02_embedding_rag.py
    （首次运行会自动下载 bge-small-zh-v1.5 模型，约 95 MB，缓存到 ~/.cache）
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer


# ============================================================
# 1) 知识库（与 v0.1 完全相同，便于对比）
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
# 2) Embedding 模型加载（单例）
#
#    选型说明：
#      - BAAI/bge-small-zh-v1.5：智源 BGE 系列中文小模型
#      - 输出维度：512
#      - 体积：约 95 MB，CPU 推理也能秒级响应
#      - 中文检索质量经过多榜单验证，是入门首选
#
#    工程要点：
#      - 模型加载耗时（数百 ms ~ 数秒），全程序只加载一次
#      - 首次运行会自动从 HuggingFace 拉取，缓存到 ~/.cache/huggingface
#      - 如果国内网络问题，可参考讲义里"使用镜像"的小节
# ============================================================

EMBED_MODEL_NAME = "BAAI/bge-small-zh-v1.5"

print(f"[v0.2] 正在加载 embedding 模型：{EMBED_MODEL_NAME}")
print(f"[v0.2] 首次运行会自动下载（约 95 MB），后续从本地缓存读取……")
_embedder = SentenceTransformer(EMBED_MODEL_NAME)
print(f"[v0.2] ✅ 模型加载完毕，输出维度 = {_embedder.get_sentence_embedding_dimension()}")
print()


def embed(texts: List[str]) -> np.ndarray:
    """
    把一组文本转成 (N, dim) 的 numpy 矩阵。
    我们启用 normalize_embeddings=True，模型会输出 **L2 归一化** 后的向量，
    这样后面算"余弦相似度"就退化成简单的点积，速度快、数值稳定。

    数学等价：
        cos(u, v) = (u · v) / (||u|| * ||v||)
        若 ||u||=||v||=1，则 cos(u, v) = u · v
    """
    return _embedder.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )


# ============================================================
# 3) 文档向量预计算（建索引）
#
#    在真实工程里，这一步会被替换成"灌库到向量数据库"（第 5 课）。
#    这里我们用最朴素的内存矩阵代替 —— 每行一个文档向量。
# ============================================================

DOC_IDS: List[str] = list(KNOWLEDGE_BASE.keys())
DOC_TEXTS: List[str] = [KNOWLEDGE_BASE[doc_id] for doc_id in DOC_IDS]

print(f"[v0.2] 正在为 {len(DOC_TEXTS)} 篇文档生成向量……")
DOC_MATRIX: np.ndarray = embed(DOC_TEXTS)  # shape: (N, dim)
print(f"[v0.2] ✅ 文档向量矩阵 shape = {DOC_MATRIX.shape}")
print()


# ============================================================
# 4) Retriever：余弦相似度检索（v0.1 retrieve 的升级版）
# ============================================================

def retrieve(
    query: str,
    top_k: int = 3,
    score_threshold: float = 0.30,
) -> List[Tuple[str, str, float]]:
    """
    向量检索 Top-K 文档。

    步骤：
        1. 把 query 编码为 1 个向量
        2. 与 DOC_MATRIX 做矩阵乘法，得到 (N,) 的相似度分数
           （因为已 L2 归一化，点积 = 余弦相似度）
        3. argsort 取 Top-K
        4. 过滤掉低于阈值的（避免把不相关文档塞进 prompt）

    返回：[(doc_id, doc_text, similarity), ...]
    """
    q_vec = embed([query])[0]              # shape: (dim,)
    sims = DOC_MATRIX @ q_vec              # shape: (N,)

    # 取 Top-K：argsort 默认升序，这里取最后 K 个并反转
    top_idx = np.argsort(sims)[::-1][:top_k]

    results: List[Tuple[str, str, float]] = []
    for i in top_idx:
        sim = float(sims[i])
        if sim < score_threshold:
            break  # 已按降序遍历，后面只会更小
        results.append((DOC_IDS[i], DOC_TEXTS[i], sim))
    return results


# ============================================================
# 5) Augment + Generate：完全复用 v0.1 的实现
#    （这里我们故意 **再写一遍**，让 v0.2 文件自包含、可独立运行；
#     从第 5 课开始我们就会做模块化拆分）
# ============================================================

PROMPT_TEMPLATE = """\
[System]
你是一个 RAG 助手。请严格基于下面提供的【参考资料】回答用户问题。
若资料中没有答案，请如实回答"我不知道"，不要编造。

[参考资料]
{context}

[用户问题]
{question}

[你的回答]
"""


def build_prompt(query: str, retrieved: List[Tuple[str, str, float]]) -> str:
    if not retrieved:
        context = "（未检索到任何相关资料）"
    else:
        context = "\n".join(
            f"<{doc_id} | sim={sim:.3f}> {text}"
            for doc_id, text, sim in retrieved
        )
    return PROMPT_TEMPLATE.format(context=context, question=query)


def mock_llm(prompt: str) -> str:
    try:
        ctx = prompt.split("[参考资料]")[1].split("[用户问题]")[0].strip()
        question = prompt.split("[用户问题]")[1].split("[你的回答]")[0].strip()
    except IndexError:
        return "[Mock LLM] Prompt 解析失败"

    if "（未检索到任何相关资料）" in ctx:
        return "[Mock LLM] 我不知道（未检索到相关资料）"

    return (
        f"[Mock LLM] 收到问题：{question}\n"
        f"[Mock LLM] 我看到了 {ctx.count('<doc-')} 篇相关资料。\n"
        f"[Mock LLM] 基于这些资料，我会综合给出回答（真实回答需要等到第 3 课接入 MiMo）。"
    )


# ============================================================
# 6) Pipeline：编排整个 RAG 流程
# ============================================================

def rag_pipeline(query: str, top_k: int = 3, verbose: bool = True) -> str:
    retrieved = retrieve(query, top_k=top_k)
    prompt = build_prompt(query, retrieved)
    answer = mock_llm(prompt)

    if verbose:
        print("=" * 60)
        print(f"❓ 用户问题：{query}")
        print("-" * 60)
        print("🔎 向量检索结果（Top-K，按余弦相似度降序）：")
        if not retrieved:
            print("   （所有候选都低于阈值，无命中）")
        for doc_id, text, sim in retrieved:
            preview = text[:40] + ("..." if len(text) > 40 else "")
            print(f"   - {doc_id} (sim={sim:.3f}) → {preview}")
        print("-" * 60)
        print("📝 实际喂给 LLM 的 Prompt：")
        print(prompt)
        print("-" * 60)
        print("🤖 LLM 回答：")
        print(answer)
        print("=" * 60)
        print()

    return answer


# ============================================================
# 7) Demo：跑与 v0.1 完全相同的 5 个 query，做对比实验
# ============================================================

def main() -> None:
    queries = [
        # ✅ v0.1 与 v0.2 都能命中
        "什么是 RAG？",
        "BM25 是什么？",
        # ⚠️ v0.1 部分命中
        "向量数据库有哪些？",
        # ❌ v0.1 失败 / ✅ v0.2 应该成功（关键测试用例）
        "苹果公司的 CEO 是谁？",
        # ❌ v0.1 失败（错别字）/ ✅ v0.2 应能容错
        "什么是 RGA？",
    ]

    for q in queries:
        rag_pipeline(q, top_k=3)


if __name__ == "__main__":
    main()
