# RAG Visual Learning Platform Plan

## 1. 目标定义

这个项目不只是“做一个能跑的 RAG demo”，而是要同时满足 3 个目标：

1. 学习目标
   以循序渐进的方式理解 RAG 的核心原理，包括：
   - 文档摄取
   - 文本切块
   - 向量化
   - 索引
   - 检索
   - 重排
   - Prompt 组装
   - LLM 生成
   - 引用与评估

2. 产品目标
   做成一个“可视化学习与研究平台”，UI 不是附属品，而是核心能力。用户应该能看到每一步发生了什么、为什么召回这些片段、为什么答案可信或不可信。

3. 工程目标
   最终沉淀为一个轻量级但完整的 RAG engine，具备最小可用闭环：
   - 数据导入
   - 索引构建
   - 查询检索
   - 回答生成
   - 引用展示
   - 基础评估

## 2. 产品定位

建议把产品定义为：

**一个面向学习者与研究者的可视化 RAG 实验台。**

它不是纯聊天工具，而是一个可以“拆开看内部机制”的交互式实验环境。

核心价值：

- 对初学者：把抽象概念变成可观察的流程
- 对研究者：快速对比不同 RAG 策略
- 对自己：在构建过程中，逐步把知识沉淀成可复用 engine

## 3. 最终产品形态

建议最终产品包含 4 个核心区域。

### A. 学习区

按章节展示 RAG 流程，每个章节都要有：

- 原理说明
- 输入输出示例
- 可交互参数
- 可视化结果
- 常见坑
- 小实验

### B. 实验区

用户可以切换参数并立即观察效果，例如：

- chunk size
- chunk overlap
- embedding model
- retrieval top-k
- similarity metric
- reranker on/off
- prompt template
- answer style

### C. 推理观察区

这是平台最重要的 UI 区域之一，需要把一次问答拆成流水线：

1. 用户问题
2. Query 预处理
3. 向量检索结果
4. 重排结果
5. 最终上下文组装
6. Prompt 预览
7. LLM 输出
8. 引用来源

每一步都可展开查看明细。

### D. Engine 区

用来管理底层轻量 RAG engine：

- 数据源管理
- 文档解析状态
- 索引状态
- 查询日志
- 配置管理
- 评估结果

## 4. 为什么 UI 必须是核心

你已经明确指出 UI 很重要，这个判断是对的。RAG 难学的核心原因不是概念多，而是中间过程不可见。

要把 UI 设计成“可解释性面板”，至少覆盖下面这些可视化：

1. 文档切块可视化
   展示原文如何被分割，块边界在哪里，overlap 如何影响上下文连续性。

2. 检索得分可视化
   展示每个 chunk 的相似度分数、排序变化、是否被 reranker 提升或压制。

3. 向量空间直观图
   初期可以用二维投影演示 chunk 和 query 的相对位置，帮助理解 embedding 的作用。

4. Prompt 组装可视化
   展示 system prompt、user query、retrieved context 如何拼接成最终输入。

5. 答案引用映射
   答案中的每一段可以高亮对应来源 chunk，帮助理解 grounded generation。

6. 参数调优对比视图
   同一个问题在不同参数下的召回结果和最终答案并排对比。

## 5. 推荐的总体架构

建议从一开始就分成前后端两层，但都保持轻量。

### 前端

- React
- TypeScript
- Vite
- Tailwind CSS
- 图表库：Recharts 或 ECharts
- 状态管理：Zustand

原因：

- 轻量
- 开发速度快
- 容易做复杂可视化
- 适合后续实验型 UI

### 后端

- Python
- FastAPI

原因：

- Python 生态最适合 RAG 学习和原型研究
- 方便接入 LangChain / LlamaIndex / 原生实现做对照
- 文档解析、embedding、评估工具成熟

### 存储与索引

第一阶段建议尽量轻：

- 元数据存储：SQLite
- 向量库：FAISS 或 Chroma
- 文件存储：本地文件系统

原因：

- 易部署
- 易理解
- 易替换

### 模型层

建议抽象成 provider 接口，不在第一阶段绑死某一家：

- Embedding provider
- LLM provider
- Reranker provider

这样后续可切换：

- OpenAI
- Ollama
- HuggingFace
- SiliconFlow / DashScope / 其他兼容 OpenAI API 的服务

## 6. 建议的工程目录

建议一开始就按学习平台 + engine 分层：

```text
mist-rag/
  docs/
    rag-learning-platform-plan.md
    architecture.md
    learning-notes/
  apps/
    web/
  services/
    api/
  packages/
    ui/
    shared/
    rag-engine/
  datasets/
    demo-corpus/
  scripts/
  evaluations/
```

职责建议：

- `apps/web`: 学习平台 UI
- `services/api`: FastAPI 服务
- `packages/rag-engine`: 核心 RAG 流程和接口抽象
- `packages/ui`: 可复用的可视化组件
- `datasets/demo-corpus`: 用于教学和演示的小型数据集
- `evaluations`: 问答样本、指标、实验记录

## 7. 学习与实现路线

建议把整个项目拆成 8 个阶段。每个阶段都同时包含：

- 学什么
- 做什么
- UI 展示什么
- engine 增加什么能力
- 如何验收

---

## 阶段 0：基础认知与脚手架

### 学习目标

- 理解什么是 RAG
- 明确 RAG 与微调、纯聊天、搜索系统的区别
- 理解最小闭环：文档 -> 检索 -> 上下文 -> 生成

### 交付物

- 前后端项目初始化
- 首页信息架构
- 基础布局
- 一个“RAG 流程总览”静态演示页

### UI 重点

- 首页用流程图展示完整 RAG 链路
- 每个节点可点开查看解释
- 提供术语卡片：chunk、embedding、top-k、rerank、grounding

### Engine 重点

- 暂时不做完整 engine
- 先定义领域模型和接口：
  - Document
  - Chunk
  - EmbeddingVector
  - RetrievalResult
  - Citation
  - AnswerTrace

### 验收标准

- 用户不看代码，也能通过 UI 理解一次 RAG 问答链路
- 工程目录完成初始化
- 前后端可联通

---

## 阶段 1：文档摄取与切块

### 学习目标

- 理解文档预处理为什么重要
- 学习 chunk size / overlap 的取舍
- 认识结构化与非结构化文档差异

### 交付物

- 支持上传 txt / md / pdf
- 文本抽取
- 基础 chunker
- chunk 预览 API

### UI 重点

- 文档上传面板
- 原文与 chunk 对照视图
- chunk size / overlap 滑杆
- 每次参数变化实时刷新切块结果

### Engine 重点

- `DocumentIngestService`
- `ChunkingService`
- chunk 元数据：
  - chunk_id
  - source_doc
  - page / section
  - token_count
  - text

### 验收标准

- 上传一份文档后可以稳定切块
- UI 可以清楚显示不同切块参数的差异
- 生成的 chunk 可持久化

---

## 阶段 2：Embedding 与索引

### 学习目标

- 理解 embedding 的本质是语义表示
- 理解为什么需要向量索引
- 理解 query 和 document 要进入同一语义空间

### 交付物

- 接入 embedding 模型
- 生成 chunk embedding
- 建立本地向量索引
- 支持重建索引

### UI 重点

- 索引构建状态面板
- 每个文档的 embedding 状态
- 向量空间演示图
  - 初期可用降维后的二维散点图

### Engine 重点

- `EmbeddingService`
- `VectorStoreAdapter`
- `IndexBuilder`

### 验收标准

- chunk 能完成 embedding 并写入索引
- 可以基于 query 返回 top-k chunk
- UI 能展示索引构建和查询状态

---

## 阶段 3：基础检索

### 学习目标

- 理解 similarity search 的基本机制
- 学习 top-k、threshold、query rewrite 的作用
- 认识“召回正确但排序不好”与“根本没召回到”的区别

### 交付物

- 查询接口
- top-k 检索
- 相似度分数返回
- 检索日志

### UI 重点

- 查询输入框
- 检索结果列表
- 分数条形图
- 结果卡片中高亮 query 对应语义片段

### Engine 重点

- `Retriever`
- `QueryPipeline`
- `RetrievalTrace`

### 验收标准

- 输入问题可以返回相关 chunk
- 每个结果带有可解释分数
- UI 中能对检索结果进行排序观察

---

## 阶段 4：生成与引用

### 学习目标

- 理解“检索”与“生成”的边界
- 学习 prompt 组装方式
- 理解 citation / source grounding 的必要性

### 交付物

- 将检索结果组装为 prompt
- 接入 LLM 生成答案
- 输出答案和引用来源

### UI 重点

- Prompt Inspector
- Answer 面板
- Citation 高亮映射
- “答案句子 -> 来源 chunk” 联动查看

### Engine 重点

- `PromptBuilder`
- `GenerationService`
- `CitationMapper`
- `RAGPipeline`

### 验收标准

- 用户可以看到最终 prompt
- 每个答案都能追溯来源
- 基础问答链路闭环完成

---

## 阶段 5：评估与调参

### 学习目标

- 理解 RAG 不是“能回答”就算成功
- 学习从召回质量、答案质量、引用质量三个维度评估
- 建立实验和对比意识

### 交付物

- 问答测试集
- 基础评估脚本
- 多参数实验对比

### UI 重点

- 实验配置面板
- 多次运行结果对比表
- 指标卡片：
  - hit rate
  - context precision
  - answer faithfulness
  - answer relevance

### Engine 重点

- `EvaluationRunner`
- `ExperimentConfig`
- `RunHistoryStore`

### 验收标准

- 可以保存多组实验结果
- 可以回看某次实验的检索与生成过程
- 可以知道某次答案差是召回差还是生成差

---

## 阶段 6：增强检索

### 学习目标

- 理解高质量 RAG 不只靠基础向量检索
- 学习 hybrid search、rerank、multi-query、parent-child retrieval 等策略

### 交付物

- reranker
- hybrid retrieval
- query rewrite
- 可选的 parent-child chunking

### UI 重点

- 检索流水线对比面板
- “初始召回 -> rerank 后排序” 对比
- 不同策略并排结果

### Engine 重点

- `HybridRetriever`
- `RerankService`
- `QueryRewriteService`

### 验收标准

- 至少能稳定对比 2 种检索策略
- UI 能看见策略变化带来的排名变化
- 实验区可以复现差异

---

## 阶段 7：知识库与多文档场景

### 学习目标

- 理解单文档问答和知识库问答的不同
- 学习元数据过滤、命名空间、文档版本管理

### 交付物

- 多数据集管理
- 标签和元数据过滤
- 知识库列表页

### UI 重点

- 数据集管理页
- 文档状态面板
- metadata filter 控件

### Engine 重点

- `KnowledgeBaseService`
- `MetadataFilter`
- `DatasetManager`

### 验收标准

- 至少支持多个数据集独立检索
- 可以按来源、标签、时间过滤
- UI 中可以看见知识库范围对结果的影响

---

## 阶段 8：轻量级完整 RAG engine 定型

### 学习目标

- 把前面分散的能力抽象成稳定接口
- 形成一个真正可复用的轻量 engine

### 交付物

- engine SDK
- 标准配置文件
- CLI 或 Playground API
- 最小部署方案

### UI 重点

- 配置导出
- 实验保存与复现
- 一键运行 demo pipeline

### Engine 重点

- 清晰的模块边界
- 配置驱动
- provider 插拔
- 基础 observability

### 验收标准

- 新建一个数据集后，能在最少步骤内完成 ingest -> index -> retrieve -> generate
- engine 可脱离学习 UI 独立运行
- 平台和 engine 的边界清楚

## 8. MVP 范围建议

不要一开始追求“大而全”，第一版 MVP 建议只做下面这条最短路径：

1. 上传 markdown / txt 文档
2. 切块并可视化
3. 生成 embedding
4. FAISS / Chroma 检索
5. 调用一个 LLM 生成答案
6. 展示引用来源
7. 展示检索过程

这 7 项做扎实，就已经是一个非常好的学习平台雏形。

## 9. 第一阶段的 UI 信息架构

建议 Web 端先做这 6 个页面。

### 1. 首页 `/`

- 项目介绍
- RAG 流程图
- 学习路径入口
- 最近实验

### 2. 学习页 `/learn`

- 分章节学习
- 每章有原理、图示、演示

### 3. 文档实验页 `/lab/ingest`

- 上传文档
- 文本抽取
- chunk 参数调试

### 4. 检索实验页 `/lab/retrieve`

- 输入 query
- 查看 top-k 结果
- 看得分、排序、来源

### 5. 问答实验页 `/lab/answer`

- 完整 RAG 问答
- 看 prompt、answer、citation

### 6. 实验对比页 `/lab/compare`

- 比较不同参数和策略

## 10. 核心数据模型建议

建议尽早稳定这些模型，避免后期 UI 和 engine 反复重构。

```ts
type Document = {
  id: string;
  title: string;
  sourceType: "txt" | "md" | "pdf";
  content: string;
  metadata: Record<string, string>;
};

type Chunk = {
  id: string;
  documentId: string;
  text: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
  metadata: Record<string, string>;
};

type RetrievalResult = {
  chunkId: string;
  score: number;
  rank: number;
  text: string;
  documentId: string;
};

type Citation = {
  answerSpan: string;
  chunkId: string;
  documentId: string;
};

type RAGRun = {
  id: string;
  query: string;
  retrieved: RetrievalResult[];
  prompt: string;
  answer: string;
  citations: Citation[];
  createdAt: string;
};
```

## 11. 技术路线建议

建议采用“双轨学习”。

### 轨道 A：原生实现

自己实现最小版：

- chunking
- embedding 调用
- vector store 封装
- retrieval
- prompt build
- answer generation

目的：

- 真正理解原理

### 轨道 B：框架对照

用 LangChain 或 LlamaIndex 做同样流程的对照实现。

目的：

- 理解工程生态
- 学会什么时候该自己写，什么时候该借框架

不要一开始就完全依赖框架，否则学习会停留在“会调 API”层面。

## 12. 每阶段产出建议

每完成一个阶段，建议固定产出三类东西：

1. 功能代码
2. 学习笔记
3. 实验结论

可以分别落到：

- `apps/web`
- `docs/learning-notes`
- `evaluations`

这样项目最后不只是代码仓库，也是你的 RAG 学习档案。

## 13. 推荐的开发顺序

如果要尽快启动，建议按下面顺序推进：

1. 初始化 monorepo 或双应用目录
2. 搭建 Web 基础 UI
3. 搭建 FastAPI 基础服务
4. 做文档上传与切块
5. 做检索 API
6. 做问答闭环
7. 做引用映射
8. 做实验对比
9. 做评估

这个顺序的原因是：

- 先把“可见性”做出来，学习反馈最强
- 再逐步补 engine 的深度
- 避免后期发现 UI 无法承载可解释性需求

## 14. 风险与控制

### 风险 1：一开始做得过重

控制方式：

- 严格限制 MVP
- 先支持少量文件类型
- 先只接 1 种 embedding 和 1 种 LLM

### 风险 2：过度依赖框架

控制方式：

- 核心流程自己写一版
- 框架只用于对照与增强

### 风险 3：UI 很花，但解释性不足

控制方式：

- 每个页面必须回答一个“为什么”
- 每个图表必须能支撑学习理解，而不是仅装饰

### 风险 4：评估缺失导致系统看起来能跑但不可研究

控制方式：

- 尽早建立实验记录和对比机制
- 每次改参数都能回放结果

## 15. 4 周启动计划

如果你想先快速起步，可以按 4 周节奏推进。

### 第 1 周

- 初始化前后端
- 做首页和学习页
- 定义核心数据模型
- 做静态 RAG 流程可视化

### 第 2 周

- 做文档上传
- 做 chunking
- 做 chunk 可视化面板

### 第 3 周

- 接 embedding
- 做向量索引
- 做基础检索页

### 第 4 周

- 做生成答案
- 做 citation 显示
- 打通最小 RAG 闭环

## 16. 你现在最应该做的第一步

当前仓库几乎是空的，所以最合理的起点不是直接写 RAG 逻辑，而是先完成“产品骨架 + 学习骨架 + engine 接口骨架”。

建议下一步直接进入：

**Sprint 1: 项目初始化 + 可视化学习首页 + 数据模型定义**

Sprint 1 的明确目标：

- 建立 Web 项目
- 建立 API 项目
- 做出第一版 RAG 流程可视化 UI
- 把核心模型和接口定下来

只要这个 Sprint 做好，后面每一步都会顺很多。
