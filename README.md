# Mist RAG

`mist-rag` 当前已经完成 Sprint 1，并继续推进阶段 1：在学习首页之外，增加“样例数据集 + 本地保存文档 + 切块预览 + 历史回看 + 删除管理 + 文档级 chunk 集合管理”的 ingest 闭环。

## 当前内容

- `apps/web`: React + Vite 学习首页，展示 RAG 关键流程、术语卡片和 Sprint 1 交付边界
- `services/api`: FastAPI 服务，提供健康检查、RAG 总览、文档列表、文档保存、切块预览、chunk 历史和文档级 chunk 集合接口
- `packages/shared`: 前后端共享的基础类型定义与学习首页单一数据源 `rag-overview.json`
- `datasets/demo-corpus`: 供实验区直接载入的样例文档
- `docs`: 产品规划与架构说明

## 当前能力

- 学习首页可展示 RAG 全链路、术语卡片和 Sprint 1 交付边界
- 文档实验区支持直接粘贴 Markdown / TXT，或导入本地 `.md` / `.txt` 文件
- 文档实验区支持载入样例数据集与已保存文档
- 当前编辑内容可保存到本地持久化存储，重启 API 后仍可重新载入
- API 支持 `chunkSize` / `chunkOverlap` 参数的切块预览
- 当前 preview 结果可保存成 chunk 历史记录，并可重新载入当时的参数和结果
- 已保存文档和 chunk 历史记录都支持删除；样例文档不可删除
- 当前 preview 结果还可以保存成“文档级 chunk 集合”，与某个文档稳定绑定，并支持删除
- 前端可展示 chunk 数量、平均长度、offset 和 token 估算
- 前后端本地开发已打通跨域访问

## 本地运行

### 统一脚本

```bash
pnpm dev:start
```

常用命令：

```bash
pnpm dev:start
pnpm dev:stop
pnpm dev:restart
pnpm dev:status
pnpm dev:logs
```

脚本会负责：

- 启动 FastAPI 服务到 `http://127.0.0.1:8000`
- 启动 Vite 前端到 `http://127.0.0.1:5173`
- 首次缺依赖时自动执行 `pnpm install`
- 首次缺 API 虚拟环境时自动创建 `.venv` 并安装 `services/api` 依赖

运行日志和 PID 文件会落到仓库根目录的 `.run/`。

### 手动运行

#### Web

```bash
pnpm install
pnpm dev:web
```

默认访问 `http://127.0.0.1:5173`。

如果 API 地址不是本地 `8000` 端口，可通过环境变量覆盖：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 pnpm dev:web
```

#### API

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

接口：

- `GET /healthz`
- `GET /api/v1/overview`
- `GET /api/v1/documents`
- `GET /api/v1/documents/{document_id}`
- `GET /api/v1/documents/{document_id}/chunk-sets`
- `POST /api/v1/documents`
- `POST /api/v1/documents/{document_id}/chunk-sets`
- `DELETE /api/v1/documents/{document_id}`
- `GET /api/v1/chunk-runs`
- `GET /api/v1/chunk-runs/{run_id}`
- `POST /api/v1/chunk-runs`
- `DELETE /api/v1/chunk-runs/{run_id}`
- `GET /api/v1/chunk-sets/{chunk_set_id}`
- `DELETE /api/v1/chunk-sets/{chunk_set_id}`
- `POST /api/v1/chunk-preview`

`GET /api/v1/documents` 会返回两个列表：

- `samples`: 来自 `datasets/demo-corpus`
- `saved`: 来自本地持久化存储 `services/api/storage/documents.json`

注意：

- `DELETE /api/v1/documents/{document_id}` 只允许删除 `saved` 文档
- `sample-*` 样例文档会返回错误，不能删除

`POST /api/v1/documents/{document_id}/chunk-sets` 请求示例：

```json
{
  "chunkSize": 280,
  "chunkOverlap": 60
}
```

文档级 chunk 集合和普通 chunk 历史的区别：

- `chunk-runs` 记录一次实验轨迹，可以不绑定文档
- `chunk-sets` 必须绑定某个文档，适合保存相对稳定的切块结果

删除规则：

- 删除 `saved` 文档时，会级联清理这个文档下的 chunk 集合
- 删除 chunk 集合时，不会删除文档本身

`POST /api/v1/documents` 请求示例：

```json
{
  "title": "my-rag-notes.md",
  "sourceType": "md",
  "content": "# Notes\n\nChunking is never free."
}
```

`POST /api/v1/chunk-runs` 请求示例：

```json
{
  "title": "my-rag-notes.md",
  "documentId": "doc-1234567890",
  "previewRequest": {
    "title": "my-rag-notes.md",
    "sourceType": "md",
    "content": "# Notes\n\nChunking is never free.",
    "chunkSize": 280,
    "chunkOverlap": 60
  }
}
```

`POST /api/v1/chunk-preview` 请求示例：

```json
{
  "title": "rag-learning-note.md",
  "sourceType": "md",
  "content": "# RAG\n\nChunking matters.",
  "chunkSize": 280,
  "chunkOverlap": 60
}
```

## 下一步

完成文档级 chunk 集合管理之后，下一步建议继续推进文档摄取：

1. 为文档级 chunk 集合增加命名和更新时间展示
2. 把 `Chunk` 持久化和文档保存真正关联起来
3. 引入真正的 dataset 管理与状态页
4. 再进入 embedding 和索引构建
