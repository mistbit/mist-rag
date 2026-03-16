# Mist RAG API

当前 FastAPI 服务提供：

- `GET /healthz`
- `GET /api/v1/overview`
- `GET /api/v1/documents`
- `GET /api/v1/documents/{document_id}`
- `GET /api/v1/documents/{document_id}/chunk-sets`
- `GET /api/v1/chunk-sets/{chunk_set_id}/index-builds`
- `POST /api/v1/documents`
- `POST /api/v1/documents/{document_id}/chunk-sets`
- `POST /api/v1/chunk-sets/{chunk_set_id}/index-builds`
- `POST /api/v1/index-builds/{build_id}/search`
- `DELETE /api/v1/documents/{document_id}`
- `GET /api/v1/chunk-runs`
- `GET /api/v1/chunk-runs/{run_id}`
- `POST /api/v1/chunk-runs`
- `DELETE /api/v1/chunk-runs/{run_id}`
- `GET /api/v1/chunk-sets/{chunk_set_id}`
- `GET /api/v1/index-builds/{build_id}`
- `DELETE /api/v1/chunk-sets/{chunk_set_id}`
- `PATCH /api/v1/chunk-sets/{chunk_set_id}`
- `POST /api/v1/chunk-preview`

说明：

- `overview` 会直接读取仓库里的共享数据文件 `packages/shared/rag-overview.json`
- `documents` 会把 `datasets/demo-corpus` 里的样例文档和 `services/api/storage/documents.json` 里的本地保存文档合并成目录
- `POST /api/v1/documents` 会把当前文档保存到本地 JSON 存储
- `POST /api/v1/documents/{document_id}/chunk-sets` 会基于某个文档当前内容和 chunk 参数，保存一个稳定的文档级 chunk 集合
- `DELETE /api/v1/documents/{document_id}` 只允许删除本地保存文档，不允许删除样例文档
- 删除文档时会级联删除该文档名下的文档级 chunk 集合
- `chunk-preview` 会根据前端提交的文本、`chunkSize`、`chunkOverlap` 返回切块预览
- `chunk-runs` 会把一次 preview 的请求参数和完整结果保存到本地 JSON 存储，便于前端回看
- `DELETE /api/v1/chunk-runs/{run_id}` 会删除指定的历史记录
- `GET /api/v1/chunk-sets/{chunk_set_id}` 会返回某个文档级 chunk 集合的完整参数和 chunk 结果
- `DELETE /api/v1/chunk-sets/{chunk_set_id}` 会删除指定的文档级 chunk 集合，不影响原文档
- `PATCH /api/v1/chunk-sets/{chunk_set_id}` 可以更新该集合的 `label` 和 `notes`
- `POST /api/v1/chunk-sets/{chunk_set_id}/index-builds` 会基于该集合生成一份索引构建记录
- `GET /api/v1/chunk-sets/{chunk_set_id}/index-builds` 会列出某个集合下的索引构建历史
- `GET /api/v1/index-builds/{build_id}` 会返回具体的向量维度、词表规模、高频词和 chunk 向量快照
- `POST /api/v1/index-builds/{build_id}/search` 会基于该索引执行 query 向量化与 top-k 检索
- 删除文档级 chunk 集合时，会级联清理它名下的索引构建记录
- 当前索引构建和检索都使用本地 `demo-hash-v1` 向量化骨架，先稳定接口、状态流和排序逻辑
- 已开启对 `http://127.0.0.1:5173` 和 `http://localhost:5173` 的本地 CORS 支持
