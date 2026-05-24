---
title: 第 1 课 · 关键词匹配的"伪 RAG"
section: v0.1 · 第一阶段：最小 RAG
description: 用最朴素的关键词命中数实现最小 RAG，体会引入 Embedding 的动机
---

> **学习目标**：理解 RAG 的最小骨架是 `检索（Retrieve） + 拼接（Augment） + 生成（Generate）`，并用最朴素的「关键词匹配 + Mock LLM」实现一个能跑的 demo，深刻体会**为什么后面要引入 Embedding**。

---

## 🧭 本课位置

```
v0.1  ←── 你在这里 ←──        极简关键词 RAG
v0.2                          引入 Embedding
v0.3                          接入真实 MiMo LLM
v0.4 ~ v1.0                   切分 / 向量库 / 混合检索 / Agent / 评估 / 服务化
```

---

## 1️⃣ 原理与数学直觉（Why）

### 1.1 RAG 的本质：把 LLM 当成"阅读理解机器"

LLM 本身有两种用法：

| 模式 | 工作方式 | 局限 |
|---|---|---|
| **闭卷问答（Closed-book QA）** | 直接问，模型靠"内部知识" | 容易幻觉、知识过时、无法访问私域 |
| **开卷问答（Open-book QA）** | 把相关资料作为上下文给它，让它**基于资料**回答 | 受限于上下文窗口、检索质量 |

**RAG = 强制让 LLM 走开卷模式。** 关键就是这个"开卷"中的"卷"从哪里来 —— 这就是**检索**要解决的问题。

### 1.2 RAG 流程的三大件

```text
                ┌────────────┐
                │  知识库 KB │   (文档集合 D = {d1, d2, ..., dn})
                └─────┬──────┘
                      │
   用户问题 q ──► [Retriever] ──► top-k 文档 D_q ─┐
                                                  │
                                    ┌─────────────▼──────────────┐
                                    │ Prompt = template(q, D_q)  │  ◄── Augment
                                    └─────────────┬──────────────┘
                                                  │
                                    ┌─────────────▼──────────────┐
                                    │           LLM              │  ◄── Generate
                                    └─────────────┬──────────────┘
                                                  ▼
                                              最终回答
```

抽象成函数就是：

```
answer = LLM( prompt_template( q, Retrieve(q, D, k) ) )
```

整个 RAG 工程化的所有花活儿，都是在**优化这个公式中的某一项**：
- 优化 `Retrieve`：BM25、向量、混合、Rerank、HyDE...
- 优化 `prompt_template`：Few-shot、CoT、引用标注...
- 优化 `D` 本身：切分策略、元数据、知识图谱...
- 优化 `LLM`：换更强的模型、Function Calling...

### 1.3 本课的"检索"为什么这么 Low？

我们用最朴素的算法：
- **检索器**：用户问题中的词 ∈ 文档中的词 → 命中
- **打分**：命中词数越多分越高（朴素 TF）

**数学上**：本课的打分函数可以写作

$$
\text{score}(q, d) = \sum_{w \in \text{tokens}(q)} \mathbb{1}[w \in d]
$$

这其实就是 **退化版的 BM25**（去掉了 IDF 与文档长度归一化）。

> 📌 **关键直觉**：到这一步你就能体会到，关键词匹配的根本缺陷是 ——
> **它无法处理同义/近义/上下位/多语言**。
> 比如用户问"苹果的总裁是谁"，文档里写的是"Apple CEO 是 Tim Cook"，关键词法直接 0 分。
> 这正是后面要引入 **Embedding** 的根本动机。

---

## 2️⃣ 代码实现细节（How）

### 2.1 设计思路：把 RAG 拆成 3 个独立函数

```python
def retrieve(query, docs, top_k):  ...   # 检索
def build_prompt(query, contexts): ...   # 拼接
def mock_llm(prompt):              ...   # 生成（本课用 Mock）
```

这种拆分的好处是：**v0.2 我们只需要替换 `retrieve` 一个函数**，其他都不动 —— 这就是"逐步演进"的精髓。

### 2.2 实现要点逐条解析

#### ① 文档结构

我们用 `dict` 存知识库，key 是 doc_id，value 是正文：

```python
KNOWLEDGE_BASE = {
    "doc-001": "RAG 是 Retrieval-Augmented Generation 的缩写...",
    "doc-002": "向量数据库用于存储 embedding 并支持相似度检索...",
    ...
}
```

> 📌 真实工程里 `doc` 还会有 `metadata`（来源、时间、标签），从 v0.4 开始我们会把它升级成 `Document` 类。

#### ② 简单分词（中文友好）

中文不像英文有空格分隔，最朴素的做法是**按字切**：

```python
def tokenize(text: str) -> set[str]:
    text = text.lower()
    # 去掉标点，按字符切
    return set(ch for ch in text if ch.isalnum())
```

> ⚠️ **这里有个坑**：如果按"字"切，"苹果"会被拆成"苹"和"果"，会引入大量噪声匹配。本课为了简单先这么做，第 6 课讲 BM25 时我们会用 `jieba` 做更合理的中文分词。

#### ③ 打分函数

```python
def score(query_tokens: set[str], doc_text: str) -> int:
    doc_tokens = tokenize(doc_text)
    return len(query_tokens & doc_tokens)   # 集合交集大小
```

> 📌 这里用 **set 交集**，等价于"命中多少独特词"，不会因为某个词在文档里反复出现就刷分。这是一个**朴素的去重 TF**。

#### ④ Top-K 排序

```python
scored = [(doc_id, score(...)) for doc_id, text in KB.items()]
scored.sort(key=lambda x: x[1], reverse=True)
return scored[:top_k]
```

> 📌 工程上你不会用 list+sort，会用 **堆（heapq.nlargest）** 优化到 `O(n log k)`。本课规模太小不必。

#### ⑤ Prompt 拼接

经典三段式：

```text
[System]    你是一个 RAG 助手，请基于下面的资料回答问题
[Context]   <doc-001>: ...
            <doc-002>: ...
[User]      用户原始问题
```

> 📌 这里的 `<doc-xxx>:` 标号很重要，是后续做**引用追溯（Citation）**的基础。

#### ⑥ Mock LLM

本课不接真模型，但要模拟出"基于上下文回答"的感觉：

```python
def mock_llm(prompt: str) -> str:
    # 简单地把 Context 段抽出来回显，证明"我看到了资料"
    return f"[Mock 回答] 根据检索到的资料：{extract_context(prompt)[:200]}..."
```

这一步看似没意义，其实非常关键 —— 它让你**清楚地看到"喂给 LLM 的到底是什么"**，这是 RAG 调试中最重要的能力。

---

## 3️⃣ 工程权衡与选型（Trade-off）

| 选择 | 优点 | 缺点 | 何时使用 |
|---|---|---|---|
| **关键词检索（BM25/字符匹配）** | 快、零成本、可解释 | 无语义、同义词失败 | 法律条文、API 文档等术语精确场景 |
| **向量检索（v0.2 起）** | 抓语义、跨语言 | 慢、需模型、可能召回噪声 | 通用问答、长尾问题 |
| **混合检索（v0.6 起）** | 鱼和熊掌兼得 | 系统复杂度高 | 生产环境标配 |

> 💡 **真实生产里几乎不会只用关键词**，但**关键词永远不会被淘汰**：
> - 它是混合检索（Hybrid）中"BM25 通道"的基础
> - 当用户搜的是 ID、SKU、错误码等"精确串"时，关键词比向量准得多

---

## 4️⃣ 面试常考点（Interview）

### Q1：为什么需要 RAG？直接 fine-tune 不行吗？
**答**：
1. **成本**：每次更新知识都要重新训练
2. **时效**：训练完就过时
3. **可追溯**：RAG 的回答有"出处"，便于审计
4. **隐私**：私有数据不进模型权重，更安全
5. **可控**：检索结果可调、可监控、可干预

### Q2：RAG 的 Pipeline 有哪些核心组件？
**答**：5 大件 —— Loader（加载）、Splitter（切分）、Embedder（向量化）、Retriever（检索）、Generator（生成）。
高阶版还会加：Reranker、Query Rewriter、Evaluator。

### Q3：为什么向量检索能搞，关键词检索还没死？
**答**：
1. 精确匹配场景（ID/型号/错误码）
2. BM25 是 Hybrid Search 的左膀右臂
3. 性能/成本远低于向量
4. 可解释性强，方便 debug

### Q4：你用过哪些 Retriever？怎么选？
**答**：可以从这几个维度回答 —— **数据规模、是否需要语义、是否多语言、对延迟的容忍度、是否需要元数据过滤**。

---

## 🧪 动手实验

1. **运行**：`python lessons/v01_keyword_rag.py`
2. **观察**：注意终端打印的 Prompt 内容，理解"喂给 LLM 的到底是什么"
3. **修改实验**：
   - 把 query 改成"苹果公司的 CEO 是谁"，看是否能命中关于 Apple/Tim Cook 的文档（**剧透：不能**，这就是动机！）
   - 把 `top_k` 改成 1，看回答质量变化
   - 在 KB 里加一条新的文档，再问相关问题

---

## 🤔 思考题

1. 如果某个文档很长，里面只有一小段和问题相关，关键词法会有什么问题？
2. 如果用户的问题里有一个错别字，关键词法会怎么样？向量法会怎么样？
3. `top_k` 越大越好吗？为什么？

---

## 🎯 下一课预告（v0.2）

我们将把 `retrieve` 函数升级 ——
- 用 **sentence-transformers** 把文档转成 768 维向量
- 用 **余弦相似度**替换关键词命中数
- 你会看到："苹果公司的 CEO" → 命中 "Apple CEO Tim Cook" ✅

📂 **本课交付物**
- 教学文档：[lesson-01-keyword-rag.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-01-keyword-rag.md)
- 代码：[v01_keyword_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v01_keyword_rag.py)
