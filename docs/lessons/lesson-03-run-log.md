---
title: 第 3 课 · 运行日志与现象观察
section: v0.3 · 第一阶段：最小 RAG
description: 把 mock_llm 换成真实 MiMo-V2.5-Pro 之后，4 个 demo 场景的预期表现与 token / 成本观察口径
---

> 这份日志包含两部分：
> 1. **本地 dry-run** 已实测通过的部分 —— 不联网，验证 v0.3 代码 import / retrieve / prompt / 计费逻辑全部 OK；
> 2. **真实 API 跑通的预期输出结构** —— 当你按下文步骤把 `MIMO_API_KEY` 填进 `.env` 之后，跑 [v03_llm_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v03_llm_rag.py) 应该看到的形态。
>
> 之所以分成两段：第 3 课开始要花真钱、要寄存 API Key，作为教程作者我们必须先把"代码本身正确"和"对外联调成功"两件事拆开，让读者看清边界。

---

## 🛠️ 环境信息

```
Python:                3.14
openai (SDK):          2.38.0
python-dotenv:         1.x
LLM:                   mimo-v2.5-pro
Endpoint:              https://api.xiaomimimo.com/v1   (OpenAI 兼容)
Embedding:             BAAI/bge-small-zh-v1.5  (沿用 v0.2)
DOC_MATRIX shape:      (6, 512)
```

凭据管理：API Key 放在项目根的 `.env` 里，由 [python-dotenv](https://pypi.org/project/python-dotenv/) 加载，不进入 git（已被 [.gitignore](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/.gitignore#L33-L33) 兜底）。模板见 [.env.example](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/.env.example)。

---

## ✅ Part 1：本地 dry-run（不联网，已实测通过）

```text
[v0.3] 正在加载 embedding 模型：BAAI/bge-small-zh-v1.5 ...
[v0.3] ✅ embedding 模型加载完毕
[v0.3] ✅ 文档矩阵 shape = (6, 512)

import OK
DOC_MATRIX shape: (6, 512)
retrieve smoke: [('doc-001', 0.711), ('doc-003', 0.513)]
build_user_prompt len: 140
mock_llm smoke: [Mock LLM] 收到问题：q
[Mock LLM] 我看到了 1 篇相关资料。
CallStats smoke: prompt=100 (cached=0) | completion=50 (reasoning=20) | total=150 | elapsed=1.23s | ≈¥0.001750
get_client raises as expected: 环境变量 MIMO_API_KEY 未设置。
all dry-run checks passed ✅
```

这一段验证了三件事：

1. `retrieve()` 与第 2 课结果**完全一致**（doc-001 sim = 0.711），证明 v0.3 没动检索逻辑；
2. `CallStats(100 输入, 50 输出)` 估算出 `¥0.001750` —— 手算：`100 × 7 / 1e6 + 50 × 21 / 1e6 = 0.0007 + 0.00105 = 0.001750`，与官网 `mimo-v2.5-pro` 国内未命中缓存定价完全对齐；
3. 未配置 Key 时 `get_client()` 立即抛出友好提示 —— 防止把空请求扔到网络上。

---

## 🌐 Part 2：联调真实 LLM 的快速 Checklist

```bash
# 1. 把模板复制成真正的 .env（这一步只做一次）
cp .env.example .env

# 2. 编辑 .env，把 MIMO_API_KEY 改成你在
#    https://platform.xiaomimimo.com/console/api-keys 申请到的 sk-xxx

# 3. 跑 4 个 demo（也可以传单独参数：compare-mock / hallucination / usage / stream）
.venv/bin/python lessons/v03_llm_rag.py
```

第一次联调若失败，按下面顺序排查：

| 现象 | 最可能原因 | 修复 |
|---|---|---|
| `RuntimeError: 环境变量 MIMO_API_KEY 未设置` | `.env` 没创建 / 没加载 | `cp .env.example .env` + 检查 `MIMO_API_KEY` 字段 |
| `401 invalid api key` | Key 错或被禁用 | 控制台撤销并重新申请 |
| `429 rate_limit_exceeded` | 撞 RPM/TPM 上限（pro 单账号 100 RPM / 10M TPM）| 等几秒重试，或把 demo 改成串行 |
| `连接超时` | 公司网络拦截 / 代理 | 用 `MIMO_BASE_URL` 切到内网代理或直连出口 |

---

## 🎬 Part 3：4 个 Demo 的预期输出结构

> 下面给出的不是逐字逐句的实跑输出（毕竟模型每次都会有差异），而是**结构形态**——
> 你跑出来时只要看到字段、量级、相对差异符合就证明跑通了。

### Demo 1：Mock LLM vs 真实 MiMo-V2.5-Pro

`python lessons/v03_llm_rag.py compare-mock` —— query 固定为 `什么是 RAG？`。

```text
======================================================================
【Demo 1】Mock LLM  vs  真实 MiMo-V2.5-Pro
======================================================================
❓ 用户问题：什么是 RAG？
🔎 向量检索 Top-K：
   - doc-001 (sim=0.711) → RAG 是 Retrieval-Augmented Generation 的缩写，...
   - doc-003 (sim=0.513) → BM25 是一种经典的稀疏检索算法...
   - doc-004 (sim=0.402) → Embedding 模型可以把一段文本映射为高维向量...

--- 🪨 Mock LLM 输出 ---
[Mock LLM] 收到问题：什么是 RAG？
[Mock LLM] 我看到了 3 篇相关资料。
[Mock LLM] 基于这些资料，我会综合给出回答（这是 mock，不是真模型）。

--- 🤖 真实 LLM 输出 ---
RAG（Retrieval-Augmented Generation，检索增强生成）的核心思路是：在大模型回答之前，先从知识库里检索出相关资料，再把资料和问题一起喂给模型生成最终答案 (doc-001)。

📊 prompt=≈350 (cached=0) | completion=≈80 (reasoning=≈40) | total=≈430 | elapsed=≈3–6s | ≈¥0.004
```

**怎么读这份对比**：

- mock 的输出**永远不会跨文档归纳** —— 它只能数"看到了几篇"。
- 真实 LLM 拿到三段相关资料后，会**自然地融合 doc-001 的定义**，并按我们 system prompt 要求**附上 (doc-001) 引用**。
- 注意 `reasoning_tokens` 是非零的 —— 说明 `mimo-v2.5-pro` 默认开启思考模式，幕后做了一段不可见的推理。

### Demo 2：幻觉对比（无上下文 vs 有上下文）

`python lessons/v03_llm_rag.py hallucination` —— 同样 `什么是 RAG？`，但分两次调用。

```text
--- ❌ 不给上下文（裸 LLM） ---
RAG 通常被解释为"检索增强生成"……（接一段较长的，可能掺入训练时记住的版本／可能略过时的描述）
📊 prompt=≈30 | completion=≈150 | total=≈180 | ≈¥0.003

--- ✅ 给上下文（RAG）---
RAG 是 Retrieval-Augmented Generation 的缩写……（紧扣 doc-001 的措辞，且附 (doc-001) 引用）
📊 prompt=≈350 | completion=≈80 | total=≈430 | ≈¥0.004
```

**关键观察点**（这就是面试常考的 RAG 价值证明）：

| 维度 | 裸 LLM | RAG |
|---|---|---|
| 事实可控 | ❌ 取决于训练数据 | ✅ 来源是你管理的 KB |
| 时效 | ❌ 知识截止 2024-12 | ✅ KB 想多新就多新 |
| 可引用 | ❌ 无 | ✅ 自带 (doc-xxx) |
| prompt 体积 | 小 | 大（这就是 RAG 的成本代价）|
| completion 长度 | 往往更长 | 往往更短（被资料"约束"住）|

### Demo 3：Token 用量与成本

`python lessons/v03_llm_rag.py usage` —— 跑 3 个 query。

```text
❓ 什么是 RAG？           → ...  📊 prompt≈350 | completion≈80 | ≈¥0.004
❓ BM25 是什么？          → ...  📊 prompt≈340 | completion≈70 | ≈¥0.004
❓ 苹果公司的 CEO 是谁？  → ...  📊 prompt≈345 | completion≈45 | ≈¥0.003
----------------------------------------------------------------------
📦 累计：prompt=≈1035 | completion=≈195 | elapsed=≈10–15s | ≈¥0.011
💡 估算口径：mimo-v2.5-pro 国内未命中缓存价 ¥7/1M（输入），¥21/1M（输出）
```

**为什么 prompt 变得这么"重"**：每个 query 都把 Top-3 文档（≈220 字）+ system prompt（≈80 字）一起塞进去，是裸调用的十几倍。这就是第 6、第 7 课要重点优化的方向（rerank 减少注入文档 / context compression）。

### Demo 4：流式输出（stream=True）

`python lessons/v03_llm_rag.py stream` —— 故意挑一个让模型多说几句的 query：`请用 3 句话讲清楚 RAG 的核心思想。`

```text
--- 🌊 Streaming ---
RAG 是一种"先查后答"的范式｜，让大模型在回答前先从你给定的知识库里检索资料｜……
（光标在终端逐字推进，每个 ｜ 处对应一次 chunk 边界）

📊 prompt=≈340 | completion=≈120 | total=≈460 | elapsed=≈4–7s | ≈¥0.004
```

我们启用了 `stream_options={"include_usage": True}`，因此**最后一帧** chunk 会带 `usage` 字段，否则纯流式调用拿不到 token 数。

---

## 🧠 v0.2 vs v0.3 的范式跃迁

| 维度 | v0.2（mock 闭环）| v0.3（真 LLM）|
|---|---|---|
| 是否需要联网 | ❌ 不需要 | ✅ 需要 |
| 是否花钱 | 0 | 按 token 计费 |
| 答案是否真的"生成" | 字符串拼接 | LLM 真生成 |
| 评测维度 | 检索命中即可 | 还要看回答忠实度 / 引用 |
| 工程关注点新增 | — | API Key 管理、限流、重试、流式、思考链、token 成本 |

到这一课为止，我们走完了**最小可演示 RAG 的全链路**。从下一课（v0.4）开始，我们会把那个写死的 6 篇 KB 换成真实文档（PDF / Markdown）的加载与切分，让 RAG 真正具备"扩容能力"。
