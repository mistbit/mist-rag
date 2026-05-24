"""
v0.1 - 关键词匹配的"伪 RAG"
==============================

教程：第 1 课
配套讲义：docs/lessons/lesson-01-keyword-rag.md

本程序的目标：
    用最简单的"关键词命中数"作为检索器，配合一个 Mock LLM，
    实现一个能跑通的最小 RAG 流程。让你在引入 Embedding 之前，
    先把 RAG 的整体骨架（Retrieve -> Augment -> Generate）理解清楚。

依赖：
    无 —— 仅使用 Python 标准库。

运行：
    python lessons/v01_keyword_rag.py
"""

from __future__ import annotations

from typing import Dict, List, Tuple


# ============================================================
# 1) 知识库（Knowledge Base）
#    真实工程里这里会是 PDF / Markdown / 数据库等多种来源
#    本课为了演示直接写死在 dict 里
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
# 2) Retriever：最朴素的关键词命中检索器
# ============================================================

def tokenize(text: str) -> set:
    """
    极简分词：
      - 转小写
      - 仅保留字母/数字/中文字符
      - 中文按"字"切（注意：会引入噪声，第 6 课用 jieba 优化）
      - 用 set 去重，等价于"独特词集合"
    """
    text = text.lower()
    return {ch for ch in text if ch.isalnum()}


def score(query_tokens: set, doc_text: str) -> int:
    """
    打分函数：query 与文档独特词集合的交集大小。
    数学形式：score(q, d) = |tokens(q) ∩ tokens(d)|
    它等价于"去重 TF"，是 BM25 去掉 IDF 与长度归一后的退化版。
    """
    return len(query_tokens & tokenize(doc_text))


def retrieve(
    query: str,
    knowledge_base: Dict[str, str],
    top_k: int = 3,
) -> List[Tuple[str, str, int]]:
    """
    检索 Top-K 文档。
    返回：[(doc_id, doc_text, score), ...]，按 score 降序。
    """
    q_tokens = tokenize(query)
    scored = [
        (doc_id, doc_text, score(q_tokens, doc_text))
        for doc_id, doc_text in knowledge_base.items()
    ]
    scored.sort(key=lambda x: x[2], reverse=True)
    # 过滤掉 0 分的（一个匹配字都没有的就别送进 prompt 浪费 token 了）
    return [item for item in scored[:top_k] if item[2] > 0]


# ============================================================
# 3) Augment：把检索结果拼接成 Prompt
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


def build_prompt(query: str, retrieved: List[Tuple[str, str, int]]) -> str:
    """把 (doc_id, text, score) 列表渲染为可读的 context。"""
    if not retrieved:
        context = "（未检索到任何相关资料）"
    else:
        context = "\n".join(
            f"<{doc_id} | score={s}> {text}"
            for doc_id, text, s in retrieved
        )
    return PROMPT_TEMPLATE.format(context=context, question=query)


# ============================================================
# 4) Generate：Mock LLM
#    本课不接真实模型，用一个假的"回显式"函数代替
#    它做两件事：
#       a) 复述检索到的资料（让你看到"模型看到的东西"）
#       b) 模拟一个"回答的结构"
# ============================================================

def mock_llm(prompt: str) -> str:
    """
    一个不会真的"思考"的 LLM。
    它会从 prompt 中抽出参考资料，并以模板化方式"假装在回答"。
    第 3 课我们会把它替换为真实的 MiMo-V2.5-Pro 调用。
    """
    # 找到 [参考资料] 与 [用户问题] 之间的内容
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
# 5) Pipeline：编排整个 RAG 流程
# ============================================================

def rag_pipeline(query: str, top_k: int = 3, verbose: bool = True) -> str:
    """端到端 RAG：retrieve -> augment -> generate。"""
    # Step 1. Retrieve
    retrieved = retrieve(query, KNOWLEDGE_BASE, top_k=top_k)

    # Step 2. Augment
    prompt = build_prompt(query, retrieved)

    # Step 3. Generate
    answer = mock_llm(prompt)

    if verbose:
        print("=" * 60)
        print(f"❓ 用户问题：{query}")
        print("-" * 60)
        print("🔎 检索结果（Top-K）：")
        if not retrieved:
            print("   （无命中）")
        for doc_id, text, s in retrieved:
            preview = text[:40] + ("..." if len(text) > 40 else "")
            print(f"   - {doc_id} (score={s}) → {preview}")
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
# 6) Demo：跑几个典型问题，体会"关键词法"的能与不能
# ============================================================

def main() -> None:
    queries = [
        # ✅ 关键词能命中
        "什么是 RAG？",
        "BM25 是什么？",
        # ⚠️ 关键词部分命中
        "向量数据库有哪些？",
        # ❌ 关键词法的"硬伤"：同义/英文/常识
        "苹果公司的 CEO 是谁？",   # KB 里写的是 "Apple"，关键词不会命中
        # ❌ 关键词法的"硬伤"：错别字
        "什么是 RGA？",            # 故意打错
    ]

    for q in queries:
        rag_pipeline(q, top_k=3)


if __name__ == "__main__":
    main()
