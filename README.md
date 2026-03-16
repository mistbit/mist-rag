# Mist RAG

`mist-rag` 当前已经完成 Sprint 1，并继续推进阶段 1、阶段 2 与基础检索之间的连接层：在学习首页之外，增加“样例数据集 + 本地保存文档 + 切块预览 + 历史回看 + 删除管理 + 文档级 chunk 集合管理 + 集合命名备注 + 索引构建记录 + top-k 检索实验 + retrieval trace history”的实验闭环。

## 当前内容

- `apps/web`: React + Vite 学习首页，展示 RAG 关键流程、术语卡片和 Sprint 1 交付边界
- `services/api`: FastAPI 服务，提供健康检查、RAG 总览、文档列表、文档保存、切块预览、chunk 历史、文档级 chunk 集合、索引构建和 top-k 检索接口
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
- 当前 preview 结果还可以保存成“文档级 chunk 集合”，与某个文档稳定绑定，并支持删除、命名和备注
- 可基于某个文档级 chunk 集合构建索引记录，观察向量维度、词表规模和基础 embedding 状态
- 可基于某个 index build 直接输入 query，返回 top-k chunk 排序结果、阈值过滤后的结果与相似度分数
- 检索结果可保存为 retrieval trace，并在页面里重新载入和回放
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
- `GET /api/v1/chunk-sets/{chunk_set_id}/index-builds`
- `POST /api/v1/documents`
- `POST /api/v1/documents/{document_id}/chunk-sets`
- `POST /api/v1/chunk-sets/{chunk_set_id}/index-builds`
- `POST /api/v1/index-builds/{build_id}/search`
- `GET /api/v1/index-builds/{build_id}/retrieval-traces`
- `POST /api/v1/index-builds/{build_id}/retrieval-traces`
- `DELETE /api/v1/documents/{document_id}`
- `GET /api/v1/chunk-runs`
- `GET /api/v1/chunk-runs/{run_id}`
- `POST /api/v1/chunk-runs`
- `DELETE /api/v1/chunk-runs/{run_id}`
- `GET /api/v1/chunk-sets/{chunk_set_id}`
- `GET /api/v1/index-builds/{build_id}`
- `GET /api/v1/retrieval-traces/{trace_id}`
- `DELETE /api/v1/chunk-sets/{chunk_set_id}`
- `DELETE /api/v1/retrieval-traces/{trace_id}`
- `PATCH /api/v1/chunk-sets/{chunk_set_id}`
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
  "chunkOverlap": 60,
  "label": "教学版 280/60",
  "notes": "更适合初学者观察段落边界。"
}
```

`PATCH /api/v1/chunk-sets/{chunk_set_id}` 请求示例：

```json
{
  "label": "高精度小块",
  "notes": "用于对比更小 chunk 下的召回颗粒度。"
}
```

文档级 chunk 集合和普通 chunk 历史的区别：

- `chunk-runs` 记录一次实验轨迹，可以不绑定文档
- `chunk-sets` 必须绑定某个文档，适合保存相对稳定的切块结果

索引构建记录说明：

- `index-builds` 绑定某个 `chunk-set`，表示某组稳定 chunk 在特定 embedding 配置下的一次索引快照
- 当前实现使用本地 `demo-hash-v1` 向量化骨架，重点是把索引状态、向量维度和基础统计稳定下来
- 删除 chunk 集合时，会级联删除它下面的索引构建记录

基础检索说明：

- `POST /api/v1/index-builds/{build_id}/search` 会把 query 用和当前索引相同的 `demo-hash-v1` 骨架向量化
- 支持 `scoreThreshold`，会先过滤低于阈值的结果，再返回 top-k
- 返回结果按相似度从高到低排序，并给出 `score`、`rank`、`offset` 和 chunk 文本
- 这一层先关注“召回和排序是怎么来的”，还没有进入生成答案阶段

检索轨迹说明：

- `retrieval-traces` 会保存一次检索请求和返回结果，包括 `query`、`topK`、`scoreThreshold` 和最终结果列表
- 它和 `chunk-runs` 的区别是：`chunk-runs` 面向切块实验，`retrieval-traces` 面向检索实验
- 删除文档时，会级联清理相关 chunk set、index build 和 retrieval trace

删除规则：

- 删除 `saved` 文档时，会级联清理这个文档下的 chunk 集合
- 删除 chunk 集合时，不会删除文档本身

命名规则：

- 创建 chunk 集合时，如果未传 `label`，系统会用 `文档标题 · chunkSize/chunkOverlap` 生成默认名称
- `notes` 用于记录为什么要保留这组切块结果

`POST /api/v1/chunk-sets/{chunk_set_id}/index-builds` 请求示例：

```json
{
  "embeddingModel": "demo-hash-v1",
  "vectorDimensions": 12
}
```

`POST /api/v1/index-builds/{build_id}/search` 请求示例：

```json
{
  "query": "什么样的 chunk 更适合检索？",
  "topK": 3,
  "scoreThreshold": 0.2
}
```

`POST /api/v1/index-builds/{build_id}/retrieval-traces` 请求示例：

```json
{
  "query": "什么样的 chunk 更适合检索？",
  "topK": 3,
  "scoreThreshold": 0.2
}
```

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

完成 retrieval trace history 之后，下一步建议继续推进 retrieval / generation：

1. 把 `demo-hash` 替换成真实 embedding provider
2. 为检索结果增加 query rewrite、retrieval trace 对比和阈值实验
3. 为索引记录补删除 / 重建和状态追踪
4. 引入真正的 prompt 组装与答案生成页
