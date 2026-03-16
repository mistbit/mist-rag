# Mist RAG API

当前 FastAPI 服务提供：

- `GET /healthz`
- `GET /api/v1/overview`
- `POST /api/v1/chunk-preview`

说明：

- `overview` 会直接读取仓库里的共享数据文件 `packages/shared/rag-overview.json`
- `chunk-preview` 会根据前端提交的文本、`chunkSize`、`chunkOverlap` 返回切块预览
- 已开启对 `http://127.0.0.1:5173` 和 `http://localhost:5173` 的本地 CORS 支持
