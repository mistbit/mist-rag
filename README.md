# Mist RAG

`mist-rag` 当前已经完成 Sprint 1，并进入阶段 1 的第一步：在学习首页之外，增加最小可用的“文档输入 + 切块预览”实验闭环。

## 当前内容

- `apps/web`: React + Vite 学习首页，展示 RAG 关键流程、术语卡片和 Sprint 1 交付边界
- `services/api`: FastAPI 服务，提供健康检查、RAG 总览和切块预览接口
- `packages/shared`: 前后端共享的基础类型定义与学习首页单一数据源 `rag-overview.json`
- `docs`: 产品规划与架构说明

## 当前能力

- 学习首页可展示 RAG 全链路、术语卡片和 Sprint 1 交付边界
- 文档实验区支持直接粘贴 Markdown / TXT，或导入本地 `.md` / `.txt` 文件
- API 支持 `chunkSize` / `chunkOverlap` 参数的切块预览
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
- `POST /api/v1/chunk-preview`

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

完成切块预览后，下一步建议继续推进文档摄取：

1. 增加样例数据集和文档列表
2. 落地 `Document` / `Chunk` 持久化
3. 支持上传后重复查看历史切块结果
4. 再进入 embedding 和索引构建
