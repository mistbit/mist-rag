# Mist RAG API

当前 FastAPI 服务提供：

- `GET /healthz`
- `GET /api/v1/overview`
- `GET /api/v1/documents`
- `GET /api/v1/documents/{document_id}`
- `POST /api/v1/documents`
- `GET /api/v1/chunk-runs`
- `GET /api/v1/chunk-runs/{run_id}`
- `POST /api/v1/chunk-runs`
- `POST /api/v1/chunk-preview`

说明：

- `overview` 会直接读取仓库里的共享数据文件 `packages/shared/rag-overview.json`
- `documents` 会把 `datasets/demo-corpus` 里的样例文档和 `services/api/storage/documents.json` 里的本地保存文档合并成目录
- `POST /api/v1/documents` 会把当前文档保存到本地 JSON 存储
- `chunk-preview` 会根据前端提交的文本、`chunkSize`、`chunkOverlap` 返回切块预览
- `chunk-runs` 会把一次 preview 的请求参数和完整结果保存到本地 JSON 存储，便于前端回看
- 已开启对 `http://127.0.0.1:5173` 和 `http://localhost:5173` 的本地 CORS 支持
