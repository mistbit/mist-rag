# Mist RAG Sprint 1 Architecture

## 目标

当前实现只覆盖规划文档里定义的 `Sprint 1`：

- 建立 Web 学习首页
- 建立 API 服务骨架
- 建立共享数据契约

这样做的目的是先把“可解释学习界面”和“稳定数据模型”立起来，为后续 ingest、chunking、retrieval 和 generation 留出清晰边界。

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

当前是整个 Sprint 1 的单一事实来源：

- `src/index.ts` 定义前端使用的类型
- `rag-overview.json` 存储学习首页与 API 的公共内容

这样前端渲染和 API 返回不会各自维护一份重复数据。

### `services/api`

FastAPI 服务只做两件事：

- 输出健康状态，便于前端或后续容器探活
- 读取共享 JSON，暴露统一的 `overview` 数据

这让 API 在 Sprint 1 阶段保持足够轻，不引入过早的数据存储或复杂抽象。

### `apps/web`

Web 首页承担学习界面的第一层职责：

- 呈现 RAG 端到端流程
- 展示关键术语
- 明确 Sprint 1 交付边界

前端会优先请求 API；如果 API 未启动，则退回本地 JSON，保证静态学习页仍然可以独立运行。

## 数据流

```text
packages/shared/rag-overview.json
  ├─> services/api/app/content.py
  │     └─> GET /api/v1/overview
  └─> apps/web/src/App.tsx
        └─> API 失败时本地回退
```

## 后续扩展建议

当进入阶段 1 和阶段 2 时，建议沿着下面的方向扩展：

1. 在 `services/api` 增加 ingest、chunk preview、dataset 管理接口
2. 在 `packages/shared` 稳定 `Document`、`Chunk`、`RetrievalResult` 等契约
3. 在 `apps/web` 拆分出 `/learn`、`/lab/ingest` 等具体页面
4. 再引入真正的向量索引、模型 provider 和评估能力

