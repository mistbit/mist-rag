---
title: 第 2 课 · 用 Embedding 让 RAG 真正"懂语义"
section: v0.2 · 第一阶段：最小 RAG
description: 把 retrieve 从"字符命中"升级为"句向量 + 余弦相似度"，体会语义检索的力量
---

> **学习目标**：理解 Embedding（句向量）的几何直觉与训练目标，弄懂"L2 归一化 + 点积 = 余弦相似度"的数学等价，并把它套进 v0.1 的骨架，在不改一行 Prompt/LLM 代码的前提下，让 RAG 一下子学会**同义词、跨语言、错别字容错**。

---

## 🧭 本课位置

```
v0.1                          极简关键词 RAG
v0.2  ←── 你在这里 ←──        引入 Embedding（本课）
v0.3                          接入真实 MiMo LLM
v0.4 ~ v1.0                   切分 / 向量库 / 混合检索 / Agent / 评估 / 服务化
```

> 🎯 **本课只改一个函数**：`retrieve()`。其余（`build_prompt`、`mock_llm`、`rag_pipeline`）原封不动。
> 这是"逐步演进"的精髓 —— 让你真切感受到**单点替换带来的能力跃迁**。

---

## 1️⃣ 原理与数学直觉（Why）

### 1.1 为什么关键词法注定走不远

回顾第 1 课的硬伤：

| 现象 | 例子 | 根因 |
|---|---|---|
| 同义词盲 | "苹果" vs "Apple" | 字符级匹配，没有语义 |
| 跨语言盲 | "ベクター DB" vs "vector database" | 同上 |
| 错别字脆弱 | "RGA" vs "RAG" | 字符序列稍变就错 |
| 高频字刷分 | "是""的""谁" | 没有 IDF |

要解决前三条，必须**让语言变成一种可以"算几何距离"的对象**。
这就是 Embedding 的使命：**给每段文本一个固定长度的向量，使得"语义近 ⇔ 向量近"。**

### 1.2 一个心智模型：把每段文本扔进高维空间

想象一个 512 维的"语义宇宙"。我们有一个魔法函数 `f`：

```
f("苹果公司的 CEO")        →  v1 ∈ ℝ⁵¹²
f("Apple CEO Tim Cook")   →  v2 ∈ ℝ⁵¹²
f("BM25 是稀疏检索算法")   →  v3 ∈ ℝ⁵¹²
```

如果 `f` 训练得好，那么 `v1` 和 `v2` 会靠得很近（因为意思一样），`v3` 则远在另一头。

> 💡 **本质**：把"理解"这件事从离散的"字符匹配"翻译到**连续的几何距离**问题。
> 一旦语言变成几何，机器学习里所有几何工具（聚类、最近邻、降维可视化）都能用了。

### 1.3 衡量两个向量"近不近"：余弦相似度

最常用的度量是 **余弦相似度（cosine similarity）**：

$$
\cos(u, v) \;=\; \frac{u \cdot v}{\|u\| \cdot \|v\|}
$$

几何含义：**两个向量夹角的余弦**。值域 `[-1, 1]`：
- `1`：方向完全一致，语义完全相同
- `0`：正交，毫无关系
- `-1`：方向相反（语言任务里几乎不会出现）

**为什么不用欧氏距离 / 曼哈顿距离？**

1. **关注方向，不关注模长**：在 Embedding 空间里，两个向量的"长度"通常代表"信息量"（句子长短、词频等），但我们想匹配的是"主题"（方向）。cosine 天然忽略模长。
2. **标准化好处理**：所有向量归一化后落在单位超球面上，分数永远在 `[-1, 1]`，直接当置信度用。
3. **数值稳定**：高维下欧氏距离会"集中"（distance concentration），区分度变差；cosine 不受此困扰。

### 1.4 关键 trick：L2 归一化后，点积 = 余弦

如果我们提前把向量都归一化到 `‖u‖ = ‖v‖ = 1`，那么：

$$
\cos(u, v) \;=\; \frac{u \cdot v}{\|u\| \cdot \|v\|} \;=\; u \cdot v
$$

也就是说 —— **算 cosine 退化成了一次点积**。在矩阵化实现中，这意味着我们可以一次性算所有文档与 query 的相似度：

```python
sims = DOC_MATRIX @ q_vec      # (N, dim) @ (dim,) = (N,)
```

这一行就是整个向量检索引擎的核心。N 可以是几千、几万、几百万 —— 在 numpy/PyTorch 里都是高度优化的 BLAS 调用。

> 📌 **工程红利**：所有主流向量库（FAISS / Chroma / Milvus / Qdrant）都有"内积索引（IP, Inner Product）"模式。
> 只要你在写入时就归一化好，"内积 = cosine"这条捷径就能一直走下去。

### 1.5 Embedding 模型是怎么训出来的？

bge / m3e / e5 这些模型不是凭空来的，它们用 **对比学习（contrastive learning）** 训练：

```
正样本对：("苹果公司的 CEO", "Apple CEO Tim Cook")        → 推近
负样本对：("苹果公司的 CEO", "BM25 是稀疏检索算法")       → 推远

损失函数（InfoNCE 简化版）：
    L = -log [ exp(sim(q, d⁺)/τ) / Σ exp(sim(q, dᵢ)/τ) ]
```

直观理解：每一步训练都让"该靠近的更靠近、该远离的更远离"，最后整个空间被"梳理"出一种**主题分布**。

> 🧠 这也是为什么 bge 知道"苹果 ≈ Apple" —— 训练语料里见过海量这样的对齐对（中英对照、问答对、翻译对、释义对）。

### 1.6 Pooling：把 token 序列压成一个向量

模型 forward 一遍后会输出 `(seq_len, hidden)` 的 token 矩阵。要变成单个 sentence embedding，常见有三种 pooling：

| 策略 | 说明 | 谁在用 |
|---|---|---|
| `[CLS]` token | 取首位特殊 token 的隐状态 | bge 系列、原版 BERT |
| `mean pooling` | 所有 token 隐状态求平均 | sentence-bert、e5 |
| `max pooling` | 各维取 max | 老派 InferSent |

bge-small-zh-v1.5 用的是 `[CLS]` + 一个轻量的归一化层，**sentence-transformers 框架已经帮我们把这套封装在 `model.encode()` 里**，我们调用方完全不用关心。

---

## 2️⃣ 代码实现细节（How）

完整代码：[v02_embedding_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v02_embedding_rag.py)

### 2.1 整体结构对比

```
v0.1                              v0.2
─────                             ─────
KNOWLEDGE_BASE                    KNOWLEDGE_BASE          ← 完全不变
                                  ★ EMBED_MODEL_NAME      ← 新增：模型名
                                  ★ _embedder             ← 新增：模型单例
                                  ★ embed()               ← 新增：编码函数
                                  ★ DOC_MATRIX            ← 新增：预计算矩阵
tokenize / score                  ──────────────────────  ← 删除：不再需要
retrieve(关键词命中数)             ★ retrieve(余弦相似度)   ← 升级
build_prompt                      build_prompt            ← 完全不变
mock_llm                          mock_llm                ← 完全不变
rag_pipeline                      rag_pipeline            ← 完全不变
```

> 🎯 凡是带 ★ 的就是改动点。**5 个变化点全部集中在"检索"这一层**，这正是我们要的"洋葱式增量"。

### 2.2 加载 Embedding 模型（一次性）

```python
EMBED_MODEL_NAME = "BAAI/bge-small-zh-v1.5"
_embedder = SentenceTransformer(EMBED_MODEL_NAME)
```

工程要点：
- **单例模式**：模型加载需要数百毫秒到数秒，**全程序只 load 一次**。本课我们直接放模块顶部；后续模块化后会用 lazy singleton 或依赖注入。
- **本地缓存**：首次会从 HuggingFace 拉取约 95 MB 的权重 + tokenizer，缓存到 `~/.cache/huggingface/hub/`。后续启动直接读缓存。
- **国内网络**：如果 `huggingface.co` 访问慢，可设置环境变量：
  ```bash
  export HF_ENDPOINT=https://hf-mirror.com
  ```
  或直接在代码顶部 `os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"`。

### 2.3 `embed()`：把文本变成 numpy 矩阵

```python
def embed(texts: List[str]) -> np.ndarray:
    return _embedder.encode(
        texts,
        normalize_embeddings=True,   # ← ★ 关键参数
        convert_to_numpy=True,
    )
```

逐条解读：
- `texts` 是 `List[str]`，函数支持批量编码 —— **批量越大，GPU/CPU 利用率越高**。生产里建议把 batch size 调到 32~128。
- `normalize_embeddings=True`：在模型输出向量后**自动做 L2 归一化**。从此点积就等于 cosine（参见 1.4）。
- `convert_to_numpy=True`：返回 `np.ndarray`。如果你后面想接 PyTorch 流程，可以改 `convert_to_tensor=True`。

返回 shape：`(len(texts), 512)`。bge-small 的输出维度是 512。

### 2.4 文档向量预计算（建索引）

```python
DOC_IDS = list(KNOWLEDGE_BASE.keys())
DOC_TEXTS = [KNOWLEDGE_BASE[doc_id] for doc_id in DOC_IDS]
DOC_MATRIX: np.ndarray = embed(DOC_TEXTS)   # (N, 512)
```

> 📌 **这就是最朴素的"向量索引"**。后面第 5 课把它替换成 Chroma / FAISS，但**接口形态完全一致**：`(query_vec, doc_matrix) → top-k`。

工程角度：
- **离线建索引、在线查询** 是检索系统的黄金法则。文档增删改的频率远远低于查询。
- 我们这里把矩阵放在内存里。规模一旦到百万级，就需要：
  - 持久化（pickle / parquet / faiss.bin）
  - ANN 索引（HNSW / IVF-PQ）把 O(N) 的暴力扫描降到 O(log N) 或 O(√N)
  - 多机分片（sharding）

### 2.5 `retrieve()`：核心三行

```python
q_vec = embed([query])[0]            # 1. 编码查询
sims = DOC_MATRIX @ q_vec            # 2. 矩阵化点积 = cosine
top_idx = np.argsort(sims)[::-1][:top_k]   # 3. 排序取 Top-K
```

三个细节问题，建议你都想一遍：

**Q：为什么 `embed([query])[0]`？**
> A：`encode` 接收 List 返回矩阵，单个 query 也得包成 `[query]`，再用 `[0]` 取出第一行。这样就能复用同一个函数，一次封装两套用法。

**Q：`np.argsort(sims)[::-1]` 是降序吗？**
> A：`argsort` 默认升序，`[::-1]` 反转就是降序。**面试常问**：能不能用 `np.argpartition` 优化到 O(N + K log K)？答：能，且当 N 很大时显著更快，因为 argsort 是 O(N log N)。

**Q：`score_threshold=0.30` 怎么定？**
> A：经验值。bge 系列经验阈值大致：
> - `>= 0.7`：基本是同义/强相关
> - `0.5 ~ 0.7`：弱相关（可能有用）
> - `< 0.3`：基本无关
>
> 真实工程里这个阈值要在**验证集上调参**（跑一批人工标注的 query/doc 对，找最大化 F1 的阈值）。

### 2.6 Prompt 里多了一个 sim 字段

```python
context = "\n".join(
    f"<{doc_id} | sim={sim:.3f}> {text}"
    for doc_id, text, sim in retrieved
)
```

这是个工程小习惯：**把检索分数也带进 Prompt**。
理论上 LLM 不需要这个数字，但实际有几个好处：

1. **调试**：人眼一扫日志，立刻看出"哪些文档质量低"
2. **可解释性**：返回给前端时，可以把 sim 当成"参考资料置信度"
3. **Rerank/过滤**：后期如果接 Reranker，可以保留这个原始分数做对比

---

## 3️⃣ 工程权衡与选型（Trade-off）

### 3.1 中文 Embedding 模型怎么选？

| 模型 | 维度 | 大小 | 中文检索质量 | 何时使用 |
|---|---|---|---|---|
| **bge-small-zh-v1.5** | 512 | ~95 MB | ⭐⭐⭐⭐ | **学习 / 中小项目首选** |
| bge-base-zh-v1.5 | 768 | ~390 MB | ⭐⭐⭐⭐⭐ | 生产标配，效果/速度平衡 |
| bge-large-zh-v1.5 | 1024 | ~1.3 GB | ⭐⭐⭐⭐⭐+ | 离线场景、对召回质量敏感 |
| bge-m3 | 1024 | ~2.3 GB | ⭐⭐⭐⭐⭐+ | 多语言 / 多粒度（dense+sparse+colbert） |
| m3e-base | 768 | ~390 MB | ⭐⭐⭐⭐ | bge 出之前的国民模型，仍可用 |
| multilingual-e5-base | 768 | ~470 MB | ⭐⭐⭐⭐ | **强多语言**：中英日韩混合场景 |

> 💡 经验法则：
> - 不知道选啥 → bge-base-zh-v1.5
> - 资源紧张 / 学习 → bge-small-zh-v1.5（本课）
> - 想最强中文 → bge-large-zh-v1.5
> - 多语言 → bge-m3 或 multilingual-e5

### 3.2 维度越高越好吗？

❌ **不一定**。维度上去后：
- **存储/带宽线性变大**：100 万文档 × 1024 维 × 4 byte ≈ 4 GB（vs 512 维只要 2 GB）
- **检索延迟线性变高**：暴力 cosine 是 O(N · dim)
- **效果边际递减**：从 512 → 768 通常有可见提升，但 768 → 1024 提升就小了

最佳实践：**在召回质量和成本之间找一个甜点**。bge-base 是非常多生产团队的"默认值"。

### 3.3 自己微调还是用开源？

99% 的场景**直接用开源就够了**。理由：
- bge-base 的训练语料覆盖了海量通用 + 多领域（电商、金融、法律、医疗）
- 微调需要 ≥ 1 万条高质量"query-相关文档对"，标注成本极高
- 即使要做领域适配，**先试 Reranker（CrossEncoder） 微调** 比直接动 Embedding 模型更划算

> 📌 例外：你的领域是 **极冷门的术语堆**（半导体工艺、基因型号、罕见病代码），开源 Embedding 在这种词上训练样本太少，确实需要微调。

### 3.4 模型缓存与镜像

- **HF 默认缓存**：`~/.cache/huggingface/hub/models--BAAI--bge-small-zh-v1.5/`
- **改缓存目录**：`export HF_HOME=/data/hf_cache`
- **国内镜像**：`export HF_ENDPOINT=https://hf-mirror.com`
- **离线部署**：把缓存目录直接打包进 Docker 镜像，启动时 `TRANSFORMERS_OFFLINE=1`

### 3.5 关键词 vs 向量：哪个更"对"？

**都不"对"，混用才"对"**。

| 维度 | 关键词（BM25）| 向量（Embedding）|
|---|---|---|
| 精确串匹配 | ✅ 极强 | ❌ 弱（model number、ID） |
| 同义/跨语言 | ❌ 0 分 | ✅ 强 |
| 错别字 | ❌ 脆弱 | ✅ 鲁棒 |
| 速度 | ✅ 极快 | ⚠️ 中等 |
| 可解释性 | ✅ 高 | ❌ 黑盒 |
| 长文档 | ⚠️ 长度偏置 | ✅ 池化抹平 |

> 💡 **生产标配是 Hybrid Search**（v0.6 课）：BM25 + Vector 各召回一批，再用 Reranker 合并打分。这样精确串和语义都不丢。

---

## 4️⃣ 面试常考点（Interview）

### Q1：余弦相似度和欧氏距离怎么选？
**答**：
- 文本/语义匹配 → cosine（关心方向，不关心模长）
- 图像/位置/物理量 → 欧氏（绝对距离有意义）
- 高维下欧氏会出现 distance concentration，cosine 区分度更稳

补一句：**L2 归一化后，欧氏距离的平方 = 2 - 2 · cosine**，所以归一化向量上两者本质等价，只是 scale 不同。

### Q2：为什么要做 L2 归一化？
**答**：
1. cos(u,v) 退化成 u·v，可以用 BLAS 矩阵乘法极速计算
2. 模长不再影响打分，避免长文档/长 query 拿到不合理高分
3. 所有向量库的"内积索引（IP）"模式都假设输入已归一化

### Q3：sentence embedding 的几种 pooling 策略？
**答**：
- **`[CLS]` pooling**：BERT 原版方案，bge 系列在用
- **mean pooling**：sentence-bert、e5 系列在用，对噪声鲁棒
- **max pooling**：早期 InferSent 用过，现在很少
- 实际效果取决于训练目标，**和 pooling 一起被监督学习"逼出"了最优组合**，不需要使用方再纠结

### Q4：Embedding 模型的训练目标是什么？
**答**：**对比学习 + InfoNCE 损失**。给定 anchor，让 positive pair 内积变大、negative pair 内积变小。
进阶补充：**hard negative mining**（在 batch 内挑最难的负样本）、**多任务训练**（QA + 释义 + 翻译同时训）、**Matryoshka 嵌套表示**（一个模型同时支持多种维度）。

### Q5：维度越高越好吗？
**答**：不是。维度增加带来的是 **存储/计算线性增长** 和 **效果边际递减**。
经验值：通用文本检索 768 维就够；多语言/多任务可考虑 1024。
**面试加分**：提一下 Matryoshka Representation Learning，模型训练时让前 64/128/256/512 维都"自成一组"，使用方可以按需截断。

### Q6：query 和文档应该用同一个模型编码吗？
**答**：必须用同一个，且**同一种 prompt 指令**。bge 系列对 query 还要求加前缀 `"为这个句子生成表示以用于检索相关文章："`（v1.5 之后这个 instruction 已内化，可不加）。
**面试加分**：提一下 **dual-encoder vs cross-encoder**——dual 是 query/doc 各编码再算 cos（快、可缓存），cross 是把 query 和 doc 拼起来一起进 BERT（准、慢，做 Rerank 用）。

---

## 🧪 动手实验

1. **跑一遍**：
   ```bash
   cd /Users/masamiyui/OpenSoureProjects/Forks/mist-rag
   source .venv/bin/activate
   python lessons/v02_embedding_rag.py
   ```

2. **观察核心彩蛋**：找到 `❓ 用户问题：苹果公司的 CEO 是谁？` 这一段，确认 doc-006 排第一、sim ≈ 0.75。

3. **改造实验**：
   - **加一条德文文档** `"Apple Inc. CEO ist Tim Cook."`，再问"苹果公司的 CEO 是谁"，看会不会跨语言命中
   - 把 `score_threshold` 调到 `0.6`，看 Q5（"什么是 RGA？"）会不会被过滤掉
   - 把 query 改成"我想知道一些关于 retrieval 的资料"，看是否能召回 BM25/RAG/向量库三篇文档
   - 把模型换成 `BAAI/bge-base-zh-v1.5`，重跑，对比分数变化

4. **数学小实验**（在 IPython 里）：
   ```python
   from lessons.v02_embedding_rag import DOC_MATRIX, embed
   import numpy as np

   # 1. 验证 L2 归一化
   print(np.linalg.norm(DOC_MATRIX, axis=1))   # 应该全是 1.0

   # 2. 文档两两相似度热力图（可视化"语义簇"）
   sim_mat = DOC_MATRIX @ DOC_MATRIX.T
   print(np.round(sim_mat, 2))
   ```

---

## 🤔 思考题

1. 如果某个文档非常长（比如一篇 5000 字的论文），整篇编码成一个 512 维向量会有什么问题？应该怎么解决？（提示：v0.4 切分课）
2. 用户问"苹果手机怎么样"，库里有"iPhone 评测"和"水果苹果的营养价值"两篇文档，向量检索会出现什么尴尬现象？怎么破？
3. 假如知识库有 1000 万条文档，每次查询都跑 `DOC_MATRIX @ q_vec` 还现实吗？这就是为什么需要 ANN 索引（v0.5 课）。
4. cosine 相似度 0.3 到底算不算"相关"？为什么不能跨模型直接比较 sim 阈值？

---

## 🎯 下一课预告（v0.3）

到目前为止，我们的 `mock_llm()` 还在装模作样地回显。
**v0.3 我们会把它换成真正的 LLM 调用** —— 接入小米 **MiMo-V2.5-Pro**（OpenAI 兼容 API），
你将看到 RAG 第一次"真说人话"，并且学会：

- 如何写 RAG 专用的 system prompt
- 如何处理 MiMo 的 `reasoning_content` 思考字段
- 如何加引用（Citation）让回答可追溯
- 如何处理流式输出（streaming）

---

📂 **本课交付物**
- 教学文档：[lesson-02-embedding-rag.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-02-embedding-rag.md)
- 运行日志：[lesson-02-run-log.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-02-run-log.md)
- 代码：[v02_embedding_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v02_embedding_rag.py)
- 上一课：[lesson-01-keyword-rag.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-01-keyword-rag.md)
