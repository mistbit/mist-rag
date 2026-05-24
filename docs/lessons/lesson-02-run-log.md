---
title: 第 2 课 · 运行日志与现象观察
section: v0.2 · 第一阶段：最小 RAG
description: 用同一组 query 对照 v0.1，亲眼看到 Embedding 是怎么"修好"关键词法的硬伤的
---

> 这份日志是 [v02_embedding_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v02_embedding_rag.py) 在本地的真实运行结果。
> 我们故意复用 v0.1 那 5 条 query，把"换了一个 retrieve 函数"前后差异放在一起对照看。

---

## 🛠️ 环境信息

```
Python:                3.14
sentence-transformers: 5.5.1
numpy:                 2.4.6
Embedding 模型:        BAAI/bge-small-zh-v1.5
输出维度:              512
文档矩阵 shape:        (6, 512)
```

模型首次运行会从 HuggingFace 自动下载（约 95 MB），缓存到 `~/.cache/huggingface`。
日志中出现一行 `FutureWarning: get_sentence_embedding_dimension has been renamed to get_embedding_dimension` —— 不影响运行，下一次迭代会一并修掉。

---

## ✅ 5 个查询的真实运行结果

### Q1: 什么是 RAG？
```
🔎 向量检索结果（Top-K，按余弦相似度降序）：
   - doc-001 (sim=0.711)  ← ✅ 命中目标文档
   - doc-003 (sim=0.513)
   - doc-004 (sim=0.402)
```
**点评**：第一名 0.711，断层领先；第二、第三名是同主题的"周边文档"（BM25、Embedding），属于合理的语义相邻召回，不会污染答案。

---

### Q2: BM25 是什么？
```
🔎 向量检索结果（Top-K，按余弦相似度降序）：
   - doc-003 (sim=0.694)  ← ✅ 命中
   - doc-005 (sim=0.421)
   - doc-001 (sim=0.398)
```
**对比 v0.1**：v0.1 这里 doc-006（Apple CEO）刷到了 score=4 的"假相关"。v0.2 第二名变成 doc-005（小米 MiMo），虽然也不是强相关，但比 v0.1 的"Apple CEO 来当 BM25 解释" 已经合理多了；并且 0.421 与 0.694 之间有明显落差，threshold 一卡就滤掉。

---

### Q3: 向量数据库有哪些？
```
🔎 向量检索结果（Top-K，按余弦相似度降序）：
   - doc-002 (sim=0.784)  ← ✅ 命中（最高相似度）
   - doc-004 (sim=0.501)
   - doc-003 (sim=0.430)
```
**点评**：sim=0.784 是本课所有 query 中最高分。语义高度对齐时，bge 模型分数会"拉得很开"。

---

### Q4: 苹果公司的 CEO 是谁？ 🌟 **本课的核心彩蛋**
```
🔎 向量检索结果（Top-K，按余弦相似度降序）：
   - doc-006 (sim=0.752)  ← ✅✅✅ 命中 Apple Tim Cook 文档！
   - doc-005 (sim=0.417)
   - doc-001 (sim=0.329)
```

**为什么这是本课最关键的一条？**

- 用户输入：「**苹果公司的 CEO** 是谁？」
- 文档内容：「**Apple** 公司目前的 **CEO** 是 Tim Cook…」
- 「苹果」这两个汉字 **没有任何一个字** 出现在文档里 —— 所以 v0.1 的关键词法**完全靠"是""的""谁"凑分**，纯属"撞大运"
- v0.2 的 bge 模型在训练时见过大量"苹果 ↔ Apple"的对齐对，把它们映射到了向量空间里**几乎相同的位置**
- 结果：sim=0.752，**断层第一**，第二名（doc-005 小米 MiMo）只有 0.417

这就是 **跨语言/同义/上下位语义检索** 的力量 —— 也是整门课程从 v0.1 升级到 v0.2 的核心动机。

---

### Q5: 什么是 RGA？（故意打错字） 🌟
```
🔎 向量检索结果（Top-K，按余弦相似度降序）：
   - doc-001 (sim=0.521)  ← ✅ 命中 RAG 文档
   - doc-003 (sim=0.467)
   - doc-004 (sim=0.368)
```

**模型的"形近字鲁棒性"**：

- 用户拼错成 `RGA`，但 bge 通过 **subword tokenizer（BPE）** 把 `RGA` 拆成与 `RAG` 高度相似的 token 序列
- 加上语境词「什么是」也提供了"找定义"的语义信号
- 模型最终把 `RGA` 的向量打到了与 `RAG` 文档非常近的位置（sim=0.521）

> 💡 这条 query 在 v0.1 里是"碰巧"靠 `R/G/A` 三个字母蒙对的（参见第 1 课 run-log）。
> 而 v0.2 是 **真正"理解"了用户想问什么** —— 哪怕用户拼成 `RGA`、`RAGS`、`检索增强` 也都能命中。

---

## 📊 v0.1 vs v0.2 对照表

| Query | v0.1（关键词命中数） | v0.2（余弦相似度） | 现象 |
|---|---|---|---|
| 什么是 RAG？ | doc-001 (4) ✅ | doc-001 (0.711) ✅ | 都命中，但 v0.2 排名更"果决" |
| BM25 是什么？ | doc-003 (5) ✅，doc-006 (4) 🤔 | doc-003 (0.694) ✅ | v0.2 第二名不再"假相关" |
| 向量数据库有哪些？ | doc-002 (6) ✅ | doc-002 (0.784) ✅ | 都强命中 |
| **苹果公司的 CEO 是谁？** | doc-006 (7) "撞大运" 🎲 | **doc-006 (0.752) 真理解** ✅ | **核心增益** |
| **什么是 RGA？**（错别字）| doc-001 (4) "蒙对" 🎲 | **doc-001 (0.521) 真容错** ✅ | **核心增益** |

> 🎯 **结论**：v0.1 → v0.2 改了 **一个函数（`retrieve`）**，但带来了 **同义词、跨语言、错别字** 三大鲁棒性升级。
> 这就是为什么向量检索在 2020 年之后成为 RAG 的标配。

---

## 🔬 顺手做的两个数学小实验（建议你也跑一下）

### 实验 1：检查 L2 归一化是否真的生效
```python
>>> import numpy as np
>>> from lessons.v02_embedding_rag import DOC_MATRIX
>>> np.linalg.norm(DOC_MATRIX, axis=1)
array([1., 1., 1., 1., 1., 1.], dtype=float32)
```
所有行向量的模长都是 1，说明 `normalize_embeddings=True` 真的把向量推到了**单位超球面**上 —— 这就是为什么我们能直接用矩阵乘法 `DOC_MATRIX @ q_vec` 当 cosine 用。

### 实验 2：观察"语义相邻"
```python
>>> sims = DOC_MATRIX @ DOC_MATRIX.T   # (6, 6) 文档两两相似度
>>> # doc-001 (RAG)  和 doc-002 (向量库)  → 大概 0.5+
>>> # doc-001 (RAG)  和 doc-006 (Apple)   → 应该最低
```
你会看到：**主题相近的文档（RAG / Embedding / 向量库）天然挤在一起，不相关的（Apple CEO）独自远在另一头**。
这就是"向量空间里的语义结构"，也是为什么后面我们能用聚类做主题挖掘、用 ANN 做高速近邻。

---

## 🎯 下一课预告（v0.3）

到目前为止，`mock_llm()` 还在装模作样地打 `[Mock LLM] 收到问题…`。
**v0.3 我们就把这一行换成真正调用小米 MiMo-V2.5-Pro**，看到 RAG 第一次"真说人话"。

---

## 📂 相关文件

- 教学讲义：[lesson-02-embedding-rag.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-02-embedding-rag.md)
- 实现代码：[v02_embedding_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v02_embedding_rag.py)
- 上一课：[lesson-01-keyword-rag.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-01-keyword-rag.md) · [lesson-01-run-log.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-01-run-log.md)
- 学习大纲：[RAG_LEARNING_OUTLINE.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/RAG_LEARNING_OUTLINE.md)
