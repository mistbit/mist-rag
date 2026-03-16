# Mist RAG

`mist-rag` 当前落地的是 Sprint 1：先把“RAG 学习平台”的产品骨架、API 骨架和共享数据契约搭起来，而不是直接跳进完整检索或生成实现。

## 当前内容

- `apps/web`: React + Vite 学习首页，展示 RAG 关键流程、术语卡片和 Sprint 1 交付边界
- `services/api`: FastAPI 最小服务，提供健康检查和 RAG 总览数据接口
- `packages/shared`: 前后端共享的基础类型定义与单一数据源 `rag-overview.json`
- `docs`: 产品规划与架构说明

## 本地运行

### Web

```bash
pnpm install
pnpm dev:web
```

默认访问 `http://127.0.0.1:5173`。

如果 API 地址不是本地 `8000` 端口，可通过环境变量覆盖：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 pnpm dev:web
```

### API

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

## 下一步

Sprint 1 完成后，下一阶段建议进入文档摄取与切块：

1. 增加上传入口与样例数据集
2. 落地 `Document` / `Chunk` 持久化
3. 提供 chunk 预览 API 和对应可视化界面

