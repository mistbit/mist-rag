# Mist RAG API

最小 FastAPI 服务，当前只提供：

- `GET /healthz`
- `GET /api/v1/overview`

它会直接读取仓库里的共享数据文件 `packages/shared/rag-overview.json`，确保前端学习首页与 API 返回的数据保持一致。

