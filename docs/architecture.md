# Mist RAG Sprint 6 Architecture

## 目标

当前实现覆盖了两个层次：

- 建立 Web 学习首页
- 建立 API 服务骨架
- 建立共享数据契约
- 增加文档输入和 chunk preview 实验区
- 增加样例数据集和本地保存文档列表
- 增加 chunk 历史记录的保存与回看
- 增加已保存文档和 chunk 历史的删除管理
- 增加文档级 chunk 集合，把切块结果真正绑定到文档
- 增加文档级 chunk 集合的删除管理
- 增加文档级 chunk 集合的命名与备注
- 增加索引构建记录，作为 embedding / index 阶段的最小骨架
- 增加基于 index build 的 top-k 检索实验
- 增加 retrieval trace history，让检索实验可以保存和回放
- 增加 Guided lab，引导用户按步骤完成一次从文档到检索回放的实验
- 增加实验预设，让 Guided lab 可以一键切到不同 chunk / retrieval 场景
- 将 Web 前端拆成 `/learn` 与 `/lab` 两个路由，分离讲解区和实验区
- 增加 A/B 对照实验面板，让两次 preview / retrieval 状态可以并排比较、按 rank 对齐，并高亮差异词

这样做的目的是先把“可解释学习界面”和“稳定数据模型”立起来，再把阶段 1 的摄取闭环和阶段 2 的索引骨架接起来。

## 目录结构

```text
mist-rag/
  apps/
    web/
  services/
    api/
  packages/
    shared/
  docs/
```

## 模块职责

### `packages/shared`

当前承担两个角色：

- `src/index.ts` 定义前端使用的类型
- `rag-overview.json` 存储学习首页与 API 的公共内容

这样前端渲染和 API 返回不会各自维护一份重复数据，同时文档目录、切块预览、chunk 集合和索引构建的请求 / 响应结构也保持明确。

### `datasets/demo-corpus`

这里存放受版本控制的样例文档：

- 用于前端实验区快速载入
- 用于演示 ingest 之后的文档列表形态
- 不和用户本地保存的文档混在一起

### `services/api`

FastAPI 服务当前承担十四类能力：

- 输出健康状态，便于前端或后续容器探活
- 读取共享 JSON，暴露统一的 `overview` 数据
- 暴露文档目录、单文档读取和文档保存接口
- 删除已保存文档
- 接收文本和 chunk 参数，返回切块预览结果
- 保存 chunk preview 结果并提供历史列表与详情
- 删除 chunk 历史记录
- 保存并读取文档级 chunk 集合
- 删除文档级 chunk 集合，并在文档删除时级联清理
- 更新文档级 chunk 集合的名称和备注
- 基于 chunk 集合构建索引记录
- 列出某个 chunk 集合下的索引构建历史
- 读取单条索引构建详情
- 基于某个 index build 执行 query 向量化与 top-k 检索
- 保存、列出、读取和删除 retrieval trace

其中切块逻辑仍然保持“轻实现”：

- 只处理 Markdown / TXT 文本
- 暂不接入 PDF 解析
- 用字符窗口 + 段落/空格边界回退生成 preview chunk

文档持久化当前也保持轻量：

- 样例文档直接读取 `datasets/demo-corpus`
- 用户保存的文档写入 `services/api/storage/documents.json`
- chunk 历史记录写入 `services/api/storage/chunk_runs.json`
- 文档级 chunk 集合写入 `services/api/storage/document_chunk_sets.json`
- 索引构建记录写入 `services/api/storage/index_builds.json`
- 检索轨迹写入 `services/api/storage/retrieval_traces.json`
- 暂时不引入 SQLite

删除策略当前保持简单：

- 只有 `saved` 文档可删除
- 样例文档属于受版本控制的数据集，不允许从 API 删除
- 删除 chunk 历史不会联动删除文档
- 删除文档会级联删除它的文档级 chunk 集合
- 删除文档级 chunk 集合不会删除文档，但会级联删除相关索引构建记录
- 删除索引相关上游对象时，也会级联删除 retrieval trace
- 文档级 chunk 集合默认会生成系统名称，但支持后续人工命名和备注
- 当前索引构建采用本地 `demo-hash-v1` 骨架，不依赖外部模型服务
- 当前 top-k 检索直接复用同一套 hash 向量空间，便于观察 query 和 chunk 如何进入同一个表示空间

### `apps/web`

Web 端当前承担两层职责：

- 呈现 RAG 端到端流程
- 展示关键术语
- 明确 Sprint 1 交付边界
- 通过 `/learn` 路由承载学习说明，降低同屏信息密度
- 通过 `/lab` 路由承载 Guided lab，把文档选择、切块、索引、检索和 trace 串成实验台
- 提供 Guided lab，把文档选择、切块、索引、检索和 trace 串成 6 步学习路径
- 根据当前实验状态自动推荐下一步，并在顶部显示当前文档 / chunk 集合 / 索引 / 结果快照
- 提供实验预设，直接填入一组适合教学的 chunk 参数和检索参数
- 提供 A/B 对照实验面板，允许把当前 preview / retrieval 状态固定到两个槽位后直接比较差异，并高亮 query 命中词、槽位独有词和 rank 变化
- 提供文档实验区，让用户直接观察 chunkSize / chunkOverlap 的变化
- 提供样例文档和已保存文档列表，让 preview 不再是一次性操作
- 提供 chunk 历史列表，让同一次实验可以被回放
- 提供删除操作，让实验区进入基础“可管理”状态
- 提供文档级 chunk 集合，让切块结果开始和具体文档建立稳定关系
- 提供文档级 chunk 集合删除，让这一层能力也具备基础维护能力
- 提供文档级 chunk 集合名称和备注，方便区分不同切块策略
- 提供索引构建面板，让用户观察向量维度、词表规模、高频词和 chunk 向量快照
- 提供检索实验区，让用户基于 index build 输入 query 并观察 top-k 排序结果
- 提供 retrieval trace 列表，让用户回放 query、threshold 和结果集

前端会优先请求 API；如果 API 未启动，则学习页总览仍会退回本地 JSON。切块实验区则依赖真实 API。

当前路由策略保持轻量：

- `/learn` 用于流程、术语、阶段边界与进入实验台的入口
- `/lab` 用于 Guided lab 和实际操作区
- `/` 会在前端自动归一到 `/learn`
- 路由切换不会重置当前实验状态，方便在学习说明和实验结果之间来回切换

Guided lab 的推进状态目前完全由前端本地状态推导：

- 选中文档后，下一步聚焦到 preview 编辑器
- 成功拿到 preview 后，下一步聚焦到结果观察与保存
- 成功选择或保存 chunk 集合后，下一步聚焦到索引构建
- 成功选择或创建 index build 后，下一步聚焦到 top-k 检索
- 成功检索后，下一步聚焦到 retrieval trace 保存与回放

这样做的目的是把“当前该学什么”和“当前系统里已经有什么资产”直接暴露在界面上，而不是让用户在同一页里自己寻找上下文。

本轮新增的 A/B 对照实验面板同样保持前端本地实现：

- 可把当前 preview 状态固定到 `A` 或 `B`
- 如果当前已经跑过检索，也会把 query、threshold、结果数和前三条命中一起固定下来
- 对照摘要会直接展示 chunk 数差值和检索结果数差值，方便快速观察参数变化带来的影响
- 对照卡会基于高排名结果提取差异词，高亮 query 命中与当前槽位独有的词，帮助用户读出“为什么结果变了”
- Rank compare 视图会把两侧高排名结果按名次对齐，直接显示当前 rank 是延续同一 chunk 还是已经发生换位

本轮还补了一层“草稿状态和资产状态分离”的处理：

- 编辑文档正文、标题或类型时，会解除当前文档绑定，避免把本地未保存内容误认为服务端文档
- 只调整 `chunkSize` / `chunkOverlap` 时，会保留当前文档绑定，便于直接保存新的 chunk 集合
- 修改检索 query / top-k / threshold 时，会清掉已展示的旧检索结果和已选 trace，避免 UI 展示过期结果

这样可以把“学习中的草稿操作”和“已经保存的稳定对象”分开，减少实验时的状态错位。

### `scripts/dev-stack.sh`

本地开发统一通过这个脚本编排：

- `start`: 同时启动 API 和 Web
- `stop`: 关闭两个服务并清理 PID
- `restart`: 顺序重启
- `status` / `logs`: 查看运行状态和日志

这样仓库对外只有一套稳定入口，不需要分别记忆前后端启动命令。

## 数据流

```text
packages/shared/rag-overview.json
  ├─> services/api/app/content.py
  │     └─> GET /api/v1/overview
  └─> apps/web/src/App.tsx
        └─> API 失败时本地回退

apps/web/src/App.tsx
  ├─> GET /api/v1/documents
  ├─> GET /api/v1/documents/{id}
  ├─> GET /api/v1/documents/{id}/chunk-sets
  ├─> GET /api/v1/chunk-sets/{id}/index-builds
  ├─> POST /api/v1/documents
  ├─> POST /api/v1/documents/{id}/chunk-sets
  ├─> POST /api/v1/chunk-sets/{id}/index-builds
  ├─> POST /api/v1/index-builds/{id}/search
  ├─> GET /api/v1/index-builds/{id}/retrieval-traces
  ├─> POST /api/v1/index-builds/{id}/retrieval-traces
  ├─> DELETE /api/v1/documents/{id}
  ├─> GET /api/v1/chunk-runs
  ├─> GET /api/v1/chunk-runs/{id}
  ├─> POST /api/v1/chunk-runs
  ├─> DELETE /api/v1/chunk-runs/{id}
  ├─> GET /api/v1/chunk-sets/{id}
  ├─> GET /api/v1/index-builds/{id}
  ├─> GET /api/v1/retrieval-traces/{id}
  ├─> DELETE /api/v1/chunk-sets/{id}
  ├─> DELETE /api/v1/retrieval-traces/{id}
  ├─> PATCH /api/v1/chunk-sets/{id}
  └─> POST /api/v1/chunk-preview
        ├─> services/api/app/documents.py
        │     ├─> datasets/demo-corpus
        │     └─> services/api/storage/documents.json
        ├─> services/api/app/chunk_runs.py
        │     └─> services/api/storage/chunk_runs.json
        ├─> services/api/app/document_chunks.py
        │     └─> services/api/storage/document_chunk_sets.json
        ├─> services/api/app/index_builds.py
        │     └─> services/api/storage/index_builds.json
        ├─> services/api/app/retrieval.py
        │     └─> 返回 top-k 检索结果
        ├─> services/api/app/retrieval_traces.py
        │     └─> services/api/storage/retrieval_traces.json
        └─> services/api/app/chunking.py
              └─> 返回 ChunkPreviewResponse
```

## 后续扩展建议

当进入阶段 1 和阶段 2 时，建议沿着下面的方向扩展：

1. 在 `services/api` 把 `demo-hash` 替换成真实 embedding provider，并补 query rewrite / retrieval trace 对照
2. 在 `packages/shared` 继续稳定 `Document`、`Chunk`、`RetrievalResult` 等契约
3. 在 `apps/web` 拆分出 `/learn`、`/lab/ingest` 等具体页面
4. 再引入 rerank、答案生成和检索评估的对照实验能力
