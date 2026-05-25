---
title: 学习大纲
description: 8~10 个迭代版本，从关键词匹配到工程化 RAG 引擎
---

> 一份循序渐进的 RAG（Retrieval-Augmented Generation）学习路线图。
> 通过 8~10 个迭代版本，从最简单的关键词匹配开始，逐步构建一个完整、工程化的 RAG 引擎。

---

## 🎯 学习者偏好（已确认）

| 维度 | 选择 | 执行方式 |
|---|---|---|
| **LLM** | 小米 MiMo-V2.5-Pro | OpenAI 兼容协议，`base_url=https://api.xiaomimimo.com/v1` |
| **Embedding** | sentence-transformers 本地模型 | 推荐 `BAAI/bge-small-zh-v1.5`（中文友好，~100MB） |
| **代码组织** | 前期单文件，后期模块化 | v0.1~v0.4 单文件，v0.5 起重构为模块 |
| **讲解侧重** | 原理 + 代码 + 工程权衡 + 面试考点 | 每节课固定 4 个板块 |

---

## 📘 关于 MiMo API 的关键信息

- **Endpoint**：`https://api.xiaomimimo.com/v1/chat/completions`
- **协议**：OpenAI 兼容 → 直接使用 `openai` Python SDK
- **模型**：`mimo-v2.5-pro`
- **认证**：`api-key: $MIMO_API_KEY` 或 `Authorization: Bearer $MIMO_API_KEY`
- **特殊点**：MiMo 默认开启**思考模式**（`thinking.type=enabled`），返回中含 `reasoning_content` 字段
- **安全建议**：通过 `.env` 文件加载 API Key，切勿写死在代码中

---

## 第零阶段：理论先行（动手前必读）

### 0.1 什么是 RAG？

- **核心思想**：让大语言模型（LLM）在回答问题前先"查资料"，再"作答"
- **解决的问题**：
  - LLM 的知识截止时间限制
  - 幻觉（Hallucination）
  - 私域知识无法访问
- **基本公式**：`RAG = Retrieval（检索） + Augmentation（增强） + Generation（生成）`

### 0.2 RAG 的核心流程图

```
文档 → 切分(Chunking) → 向量化(Embedding) → 存入向量库(Vector Store)
                                                    ↓
用户提问 → 向量化 → 相似度检索 → Top-K 文档 → 拼接 Prompt → LLM → 回答
```

### 0.3 学习路径总览

通过 **8~10 个迭代版本** 逐步构建完整的 RAG 引擎，每一版只增加一点点复杂度。

---

## 🟢 第一阶段：最小可运行的 RAG（v0.1 ~ v0.3）

### 📘 第 1 课 · `v0.1` —— 关键词匹配的"伪 RAG"

**目标**：理解"检索 + 生成"的最小骨架，先不引入向量。

- 用 Python 字典存几段文档
- 用关键词字符串匹配做"检索"
- 把命中的文档拼到 prompt 里，调用 Mock LLM
- **产出**：`lessons/v01_keyword_rag.py`，约 50 行代码
- **思考题**：关键词匹配的局限是什么？

### 📘 第 2 课 · `v0.2` —— 引入真实的 Embedding

**目标**：理解"语义"是如何被向量表达的。

- Embedding 概念：高维空间中的语义距离
- 选型：`sentence-transformers`（本地，bge-small-zh）
- 把每段文档转换成向量，存在内存中
- 用 **余弦相似度** 替换关键词匹配
- **思考题**：为什么 768 维向量能表达"语义"？

### 📘 第 3 课 · `v0.3` —— 接入真实 LLM（小米 MiMo）

**目标**：完成端到端最小闭环。

- 用 `openai` SDK 接入 MiMo-V2.5-Pro
- 设计 Prompt 模板：System Prompt + Context + Question
- 处理 LLM 的流式输出（Streaming）
- 处理 MiMo 特有的 `reasoning_content` 字段
- **产出**：能问能答的命令行小工具

---

## 🟡 第二阶段：让 RAG 变得"实用"（v0.4 ~ v0.5）

### 📘 第 4 课 · `v0.4` —— 文档切分（Chunking）的艺术

**目标**：理解为什么"切得好"比"模型好"更重要。

- 切分策略对比：
  - 固定长度切分
  - 按段落 / 句子切分
  - 递归字符切分（Recursive Character Splitter）
  - 基于语义的切分（Semantic Chunking）
- Chunk Size 与 Overlap 的权衡
- 多种文档格式解析：`.txt`、`.md`、`.pdf`、`.docx`、`.html`
- **产出**：`DocumentLoader` + `TextSplitter` 模块

### 📘 第 5 课 · `v0.5` —— 引入持久化的向量数据库

**目标**：从"内存玩具"升级为"工程系统"。**本课开始项目模块化重构。**

- 向量库选型对比：
  - 轻量级：FAISS、Chroma、LanceDB
  - 生产级：Milvus、Qdrant、Weaviate、PGVector
- 索引类型：Flat、IVF、HNSW（原理与权衡）
- 元数据（metadata）过滤
- **产出**：可以索引整个文件夹的 RAG 系统

---

## 🟠 第三阶段：进阶检索技巧（v0.6 ~ v0.7）

### 📘 第 6 课 · `v0.6` —— 混合检索（Hybrid Search）

**目标**：解决"纯向量检索召回不全"的问题。

- 稀疏检索：BM25 原理与实现
- 稠密检索：向量召回
- **RRF（Reciprocal Rank Fusion）** 融合算法
- Reranker（重排序模型）：`bge-reranker`、`cohere-rerank`
- **产出**：`HybridRetriever`

### 📘 第 7 课 · `v0.7` —— 查询改写与多路召回

**目标**：用户的问题往往不适合直接拿去检索。

- **HyDE**（Hypothetical Document Embedding）
- **Query Decomposition**（问题拆分）
- **Multi-Query**（生成多个变体问题）
- **Step-Back Prompting**（退一步思考）
- **Self-Querying**（让 LLM 提取过滤条件）

---

## 🔴 第四阶段：完整工程化的 RAG 引擎（v0.8 ~ v1.0）

### 📘 第 8 课 · `v0.8` —— Agentic RAG 与工具调用

- 让 RAG 学会判断"是否需要检索"
- 多轮检索（Iterative Retrieval）
- 引入 ReAct 框架
- 利用 MiMo 的 Function Calling 能力

### 📘 第 9 课 · `v0.9` —— 评估体系

- **指标**：召回率、MRR、Hit Rate、Faithfulness、Answer Relevance
- 框架：RAGAS、TruLens、DeepEval
- 构建评估 Pipeline

### 📘 第 10 课 · `v1.0` —— 服务化与前端

- FastAPI 封装为 HTTP 服务
- 流式 SSE 接口
- 简单的 Web UI（Streamlit / Gradio / Next.js）
- 引入会话历史与多用户隔离

---

## 🟣 第五阶段：拓展话题（可选）

- **GraphRAG**：基于知识图谱的 RAG
- **Long-Context vs RAG**：长上下文模型出现后 RAG 是否还有意义？
- **多模态 RAG**：图片、表格、音频
- **RAG 缓存与成本优化**
- **隐私与安全**：数据脱敏、访问控制

---

## 📐 每节课的固定结构

每节课按以下 4 个板块讲解（满足"原理 + 代码 + 工程 + 面试"四个维度）：

```
┌──────────────────────────────────────────┐
│ 1️⃣ 原理与数学直觉  (Why)                  │
│    为什么这样设计？背后的数学/算法直觉      │
├──────────────────────────────────────────┤
│ 2️⃣ 代码实现细节   (How)                   │
│    逐行讲关键代码、为什么这样写、有什么坑   │
├──────────────────────────────────────────┤
│ 3️⃣ 工程权衡与选型 (Trade-off)             │
│    生产环境选型对比、各方案优缺点          │
├──────────────────────────────────────────┤
│ 4️⃣ 面试常考点    (Interview)              │
│    这一课能引出哪些常见的面试问题           │
└──────────────────────────────────────────┘
```

**每课结束附带**：思考题 + 动手实验 + 下一课预告。

---

## 🗂️ 项目最终形态预览

```
mist-rag/
├── lessons/                  # 各阶段单文件代码（v0.1 ~ v0.4）
│   ├── v01_keyword_rag.py
│   ├── v02_embedding_rag.py
│   ├── v03_mimo_rag.py
│   └── v04_chunking.py
├── rag/                      # 从 v0.5 开始的模块化项目
│   ├── loaders/              # 文档加载器
│   ├── splitters/            # 切分器
│   ├── embeddings/           # 向量化
│   ├── vectorstores/         # 向量库
│   ├── retrievers/           # 检索器（含 hybrid、rerank）
│   ├── llms/                 # LLM 客户端
│   ├── prompts/              # Prompt 模板
│   └── pipeline.py           # 编排层
├── api/                      # v1.0 FastAPI 服务
├── eval/                     # v0.9 评估
├── examples/                 # 示例文档与脚本
├── tests/
├── .env                      # API Key（不入版本库）
├── .env.example
├── .gitignore
├── pyproject.toml / requirements.txt
└── README.md
```

---

## 🎓 学习方式建议

1. **每节课你来"提问 / 给数据 / 提需求"，我来逐步实现**
2. **每一版只新增一个核心概念**，旧代码尽量保留可对照阅读
3. **每节课结束都有"思考题 + 实验任务"**，让你动手而不是只看
4. **遇到不理解的概念**：随时打断我，我们就停下来深入讲解
5. **代码全部可运行**，依赖会逐步添加，不一次性堆很重的栈

---

## 📅 课程进度跟踪

| 课次 | 版本 | 主题 | 状态 |
|:---:|:---:|---|:---:|
| 0 | - | 理论先行 | ⬜ |
| 1 | v0.1 | 关键词匹配伪 RAG | ✅ |
| 2 | v0.2 | Embedding + 余弦相似度 | ✅ |
| 3 | v0.3 | 接入 MiMo-V2.5-Pro | ✅ |
| 4 | v0.4 | 文档切分艺术 | ⬜ |
| 5 | v0.5 | 持久化向量库 + 模块化重构 | ⬜ |
| 6 | v0.6 | 混合检索 (BM25 + 向量 + RRF + Rerank) | ⬜ |
| 7 | v0.7 | 查询改写 (HyDE / Multi-Query) | ⬜ |
| 8 | v0.8 | Agentic RAG | ⬜ |
| 9 | v0.9 | 评估体系 | ⬜ |
| 10 | v1.0 | 服务化与前端 | ⬜ |

> 完成一课后，把对应行的 ⬜ 改为 ✅ 即可。

---

> 📌 本提纲是整个学习的"路线图"。如需调整顺序、增删课程或对某一课深入展开，随时反馈，提纲为你服务。
