# Mist RAG Sprint 2 Architecture

## 目标

当前实现覆盖了两个层次：

- 建立 Web 学习首页
- 建立 API 服务骨架
- 建立共享数据契约
- 增加文档输入和 chunk preview 实验区
- 增加样例数据集和本地保存文档列表

这样做的目的是先把“可解释学习界面”和“稳定数据模型”立起来，再把阶段 1 的第一步真正变成一个可运行闭环。

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

这样前端渲染和 API 返回不会各自维护一份重复数据，同时切块预览的请求 / 响应结构也保持明确。

### `datasets/demo-corpus`

这里存放受版本控制的样例文档：

- 用于前端实验区快速载入
- 用于演示 ingest 之后的文档列表形态
- 不和用户本地保存的文档混在一起

### `services/api`

FastAPI 服务当前承担四类能力：

- 输出健康状态，便于前端或后续容器探活
- 读取共享 JSON，暴露统一的 `overview` 数据
- 暴露文档目录、单文档读取和文档保存接口
- 接收文本和 chunk 参数，返回切块预览结果

其中切块逻辑仍然保持“轻实现”：

- 只处理 Markdown / TXT 文本
- 暂不接入 PDF 解析
- 用字符窗口 + 段落/空格边界回退生成 preview chunk

文档持久化当前也保持轻量：

- 样例文档直接读取 `datasets/demo-corpus`
- 用户保存的文档写入 `services/api/storage/documents.json`
- 暂时不引入 SQLite

### `apps/web`

Web 端当前承担两层职责：

- 呈现 RAG 端到端流程
- 展示关键术语
- 明确 Sprint 1 交付边界
- 提供文档实验区，让用户直接观察 chunkSize / chunkOverlap 的变化
- 提供样例文档和已保存文档列表，让 preview 不再是一次性操作

前端会优先请求 API；如果 API 未启动，则首页总览仍会退回本地 JSON。切块实验区则依赖真实 API。

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
  ├─> POST /api/v1/documents
  └─> POST /api/v1/chunk-preview
        ├─> services/api/app/documents.py
        │     ├─> datasets/demo-corpus
        │     └─> services/api/storage/documents.json
        └─> services/api/app/chunking.py
              └─> 返回 ChunkPreviewResponse
```

## 后续扩展建议

当进入阶段 1 和阶段 2 时，建议沿着下面的方向扩展：

1. 在 `services/api` 增加文档删除、更新、chunk 持久化和 PDF 解析
2. 在 `packages/shared` 继续稳定 `Document`、`Chunk`、`RetrievalResult` 等契约
3. 在 `apps/web` 拆分出 `/learn`、`/lab/ingest` 等具体页面
4. 再引入真正的向量索引、模型 provider 和评估能力
