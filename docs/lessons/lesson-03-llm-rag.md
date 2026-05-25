---
title: 第 3 课 · 把 Mock 换成真实 MiMo-V2.5-Pro
section: v0.3 · 第一阶段：最小 RAG
description: 接入小米 MiMo OpenAI 兼容 API，看 LLM 在 RAG 框架下如何被"约束"产出高保真答案，并把幻觉抑制、token 成本、流式与思考链一次性讲透
---

> **学习目标**：把 v0.2 里的 `mock_llm` 替换成真实大模型调用，理解 RAG 真正"跑起来"之后多出来的所有工程问题——API Key 管理、Prompt 工程、幻觉抑制机理、token 计费、流式 / 思考链、限流与重试。完成本课后，你会拥有一个能回答任意问题、回答忠实于私有知识库、可估算成本、可流式输出的最小 RAG 引擎。

---

## 🧭 本课位置

```
v0.1                          极简关键词 RAG
v0.2                          引入 Embedding 语义检索
v0.3  ←── 你在这里 ←──        接入真实 MiMo-V2.5-Pro（本课）
v0.4 ~ v1.0                   切分 / 向量库 / 混合检索 / Agent / 评估 / 服务化
```

> 🎯 **本课依然只改一个东西**：把 `mock_llm()` 换成 `llm_chat()`。其余检索、Prompt、Pipeline 保持兼容。
> 这是"小步快跑、单点演进"的第三步。

---

## 1️⃣ 原理（Why）：RAG 真正抑制幻觉的机理

### 1.1 LLM 凭什么会胡说

LLM 的训练目标本质是 **next-token prediction**：给定 prefix，最大化下一个 token 的对数似然。这意味着：

- 模型并不知道"自己不知道"——它**永远能给出一个 token**，即使没有可靠依据。
- 训练语料中如果出现过类似问题的"形似答案"，模型就会**走近邻路径**输出，而非声明"我不知道"。
- 知识截止日期之后的事实，模型只能"猜"。

这就是大模型幻觉（hallucination）的根因。

### 1.2 RAG 是如何打破这个魔咒的

RAG 的核心机制可以用一句话概括：

> **把"开放问答"变成"阅读理解"**。

| 维度 | 裸 LLM | RAG |
|---|---|---|
| 任务形态 | open-domain QA | reading comprehension |
| 模型靠什么作答 | 训练时记住的参数化知识 | Prompt 中现给的资料 |
| 错了能否定位 | ❌ 不可解释 | ✅ 看 retrieve / prompt 即可 |
| 知识更新 | 重新预训练 / fine-tune | 改 KB 即可 |
| 时效 | 截止训练数据 | 你想多新就多新 |

我们在 system prompt 里写下了三道"护栏"：

1. **角色限定**："你是一名严谨的 RAG 助手"——把模型从开放姿态拉到检索姿态；
2. **事实溯源约束**："请严格基于【参考资料】回答"——只允许从 prompt 中取证；
3. **诚实兜底**："若资料无法支撑答案，请如实回答'资料中没有相关信息'，绝对不要编造"——给模型一个不丢面子的退路。

这三句话看似平平无奇，却是把 LLM 从"作家"切换到"助理"的开关。

### 1.3 为什么"上下文"会真的有效

从注意力机制角度：模型在生成每个 token 时，attention 会同时关注 (a) 已生成的 prefix 和 (b) 注入的资料。当资料中明确出现"Tim Cook"、"Apple CEO"这些 token，模型在生成回答时它们的 attention score 会显著高于训练时记忆里的某个干扰答案。

换句话说：**Prompt 越具体、越接近答案，模型越没有"自由发挥"的余地**。这就是为什么我们在 [build_user_prompt](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v03_llm_rag.py#L165-L173) 里把 `<doc-001 | sim=0.711>` 这种 tag 也塞进去——它是给 LLM 的"出处提示"。

---

## 2️⃣ 代码详解（How）

第 3 课主程序在 [v03_llm_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v03_llm_rag.py)。我们逐段拆。

### 2.1 凭据加载：[python-dotenv](https://pypi.org/project/python-dotenv/)

```python
from dotenv import load_dotenv
load_dotenv()
MIMO_API_KEY = os.getenv("MIMO_API_KEY", "")
MIMO_BASE_URL = os.getenv("MIMO_BASE_URL", "https://api.xiaomimimo.com/v1")
MIMO_MODEL = os.getenv("MIMO_MODEL", "mimo-v2.5-pro")
```

为什么不用配置文件？两个原因：

1. **CI / Docker 友好**：docker run 直接 `-e MIMO_API_KEY=xxx` 即可；
2. **难写错文件而泄漏**：`.env` 已被 `.gitignore` 显式忽略（见 [.gitignore](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/.gitignore#L33-L33)）。

模板见 [.env.example](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/.env.example)，使用流程：`cp .env.example .env` → 填真值 → 完事。

### 2.2 Client：用 OpenAI SDK 调小米端点

MiMo 提供了 OpenAI 兼容协议（详见小米 [API 文档](https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api)），所以我们直接复用 `openai` 这个老牌 SDK：

```python
from openai import OpenAI

def get_client() -> OpenAI:
    if not MIMO_API_KEY:
        raise RuntimeError("环境变量 MIMO_API_KEY 未设置...")
    return OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_BASE_URL)
```

这个抽象的好处：未来想切到 GPT-4、Claude、Qwen，**只改 base_url + model 名**，整个业务代码 0 改动。

### 2.3 Prompt 模板的工程细节

```python
SYSTEM_PROMPT = (
    "你是一名严谨的 RAG 助手。请严格基于【参考资料】回答用户问题。\n"
    "若资料无法支撑答案，请如实回答“资料中没有相关信息”，绝对不要编造。\n"
    "回答时要简洁、直接，并在引用事实后用 (doc-xxx) 标注来源。"
)
```

工程要点：

- **system 与 user 分离**：约束放 system，事实放 user。这是 OpenAI 范式的最佳实践；
- **显式要求引用**：`(doc-xxx)` 这种格式让答案具备可追溯性，未来评测时甚至可以正则验证它真的引到了 retrieve 给出的 doc_id；
- **不要留"也许"措辞**：很多新手会写"以下信息可能不完整，仅供参考"——这反而让模型自我怀疑、更倾向于补充编造。

### 2.4 非流式 vs 流式

非流式（[llm_chat](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v03_llm_rag.py#L208-L235)）：一次性等服务端生成完，返回 `resp.choices[0].message.content` 与 `resp.usage`。最简单、最适合后台批处理。

流式（[llm_chat_stream](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v03_llm_rag.py#L237-L274)）：

```python
stream = client.chat.completions.create(
    ...,
    stream=True,
    stream_options={"include_usage": True},  # 关键：最后一帧带 usage
)
for chunk in stream:
    if chunk.choices:
        piece = chunk.choices[0].delta.content
        if piece:
            sys.stdout.write(piece); sys.stdout.flush()
    if chunk.usage is not None:
        usage = chunk.usage
```

**坑点**：默认流式不返回 `usage`，必须显式 `stream_options={"include_usage": True}`，否则你拿不到 token 数 → 也就估不了费。

### 2.5 Token 用量与成本估算

```python
@dataclass
class CallStats:
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    cached_tokens: int
    total_tokens: int
    elapsed_sec: float

    @property
    def cost_cny(self) -> float:
        miss = max(self.prompt_tokens - self.cached_tokens, 0)
        cost_in = (miss * 7.00 + self.cached_tokens * 1.40) / 1_000_000
        cost_out = self.completion_tokens * 21.00 / 1_000_000
        return cost_in + cost_out
```

口径来自小米官网[定价页](https://platform.xiaomimimo.com/docs/zh-CN/pricing) 的 `mimo-v2.5-pro` 国内价（≤ 256K 上下文）：

- 输入未命中缓存：¥7.00 / 1M tokens
- 输入命中缓存：¥1.40 / 1M tokens
- 输出：¥21.00 / 1M tokens

**为什么把缓存命中纳进来**？因为同一个 system prompt 反复发，云端会做 KV cache 命中并返回 `prompt_tokens_details.cached_tokens` —— 这是大流量场景**降本的最大杠杆**（命中价 1/5）。我们的小知识库太迷你，不会触发，但代码留了正确的口径，未来生产环境直接生效。

### 2.6 思考链 token 的隐藏成本

`mimo-v2.5-pro` 默认 `thinking.type = "enabled"`。这意味着：

- 你在 `message.content` 看到的回答只是冰山一角；
- 真正的 `completion_tokens` 还包括 `completion_tokens_details.reasoning_tokens`（不可见的内部推理）；
- **二者按相同价格计费**——所以 reasoning 越长、账单越多。

如果你做的是"格式化结构化输出"或者对延迟敏感的任务，可以在请求里加：

```python
extra_body={"thinking": {"type": "disabled"}}
```

把思考关掉，速度会快很多，但复杂推理质量也会降。这是一个明确的工程权衡。

---

## 3️⃣ 工程权衡（Trade-offs）

### 3.1 温度（temperature）

| 场景 | 推荐温度 | 理由 |
|---|---|---|
| RAG 抽取式问答 | 0.0 ~ 0.3 | 越确定越好，避免胡乱发挥 |
| 长文写作 / 摘要 | 0.5 ~ 0.7 | 适度多样性 |
| 创作 / brainstorming | 0.8 ~ 1.2 | 多样性优先 |

> ⚠️ 注意：`mimo-v2.5-pro` 在思考模式下会**强制使用 1.0** 温度，即使你传 0.3 也会被忽略——这是官方文档[明确说明](https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api)的。

### 3.2 max_completion_tokens

不要写得太大。MiMo 的 `mimo-v2.5-pro` 默认上限 131072（128K），但实际：

- 写小了（如 1024）→ 答案被截断 `finish_reason="length"`；
- 写大了 → 单次失败重试时浪费的 reasoning token 也会按"已耗费"算（即使没返回 content）。

**经验值**：抽取式问答 512–1024，长文摘要 2048–4096，写报告 8192–16384。

### 3.3 限流（RPM / TPM）

`mimo-v2.5-pro` 单账号 100 RPM、10M TPM。批量评测时极容易撞 429。
推荐配套两件事：

1. 用 [tenacity](https://tenacity.readthedocs.io/) 或自写指数退避：`backoff = min(60, 2 ** attempt)`；
2. 多 demo 串行而非并行——本课故意用了 for 串行，就是这个道理。

### 3.4 缓存命中（KV cache）

平台对**完全相同前缀**的 system prompt 会做 KV cache。要让命中率高：

- system prompt 写**死**，不要随时间变化；
- few-shot 示例放 system 段或 user 段最前面，固定不变；
- 把"动态资料"放最后（user 末尾）；
- 大 KB 灌一次的批量计算，不必频繁打 API。

### 3.5 Anthropic 兼容协议

MiMo 同时支持 `https://api.xiaomimimo.com/anthropic/v1/messages`，字段是 Claude 风格。
**为什么我们选 OpenAI 协议**？因为 LangChain / LlamaIndex / 大部分开源 RAG 框架都是先以 OpenAI 协议为蓝本。学到这一层，你拿任何工具都能即插即用。

---

## 4️⃣ 面试常考点（Q&A）

### Q1：RAG 真的能消除幻觉吗？

**短答**：不能，只能显著降低，并把"幻觉是什么"变得可控。

**长答**：即使有上下文，模型仍可能：
- 误读资料（understanding error）；
- 把多个资料拼错（compositional error）；
- 在资料缺失片段时填补（gap filling）。

工业界进一步抑制幻觉的手段：rerank 提升资料相关性、faithfulness evaluator 检测答案是否来自资料、self-RAG 让模型自查。

### Q2：为什么不直接 fine-tune 模型记住知识？

- **更新成本**：知识库每加一条都要 SFT 一遍，不现实；
- **可追溯**：fine-tune 后回答没有出处；
- **多租户**：不同用户私有数据混入会导致泄漏；
- **小公司预算**：fine-tune pro 模型一次几千到几万元，RAG 只要 KB 与 retrieve。

### Q3：Token 成本怎么估算？

公式：`成本 = 输入 tokens × 输入单价 + 输出 tokens × 输出单价`，单位 `元 / 1M tokens`。
关键要点：
1. 输入 tokens 可能远多于你想象——RAG 的 prompt 很重；
2. **输出比输入贵 3 倍**（v2.5-pro：¥21 vs ¥7），所以让模型简洁回答能直接省钱；
3. **缓存命中价是未命中的 1/5**，固定 system prompt 是高 ROI 的优化；
4. reasoning_tokens 计入输出但**用户看不到**——这是隐性成本。

### Q4：流式输出比非流式贵吗？

不贵。**总 token 数和总耗时在服务端都是一样的**，只是返回方式不同。流式只影响：

- 用户体验（首字节快）；
- 客户端处理逻辑（要循环消费 chunk）；
- 拿到 usage 的时机（要 `include_usage`）。

成本是相同的。

### Q5：API Key 泄漏了怎么办？

立刻：
1. 去[控制台 API Keys 页](https://platform.xiaomimimo.com/console/api-keys) **撤销**该 Key（这是最重要的一步，不要先想别的）；
2. 重新生成新 Key 并替换 `.env`；
3. 看用量页确认是否有异常消费（异常的话可以申请客服）；
4. 如果泄漏在 git 历史中：`git filter-repo` 重写历史 + 强制推送。

### Q6：为什么 system prompt 要写"绝对不要编造"，而不是"请尽量不编造"？

强约束 vs 弱约束的区别。LLM 对**绝对句**的服从度显著高于**程度副词句**：

- 弱：「请尽量准确」→ 模型会理解为"不准也没关系"；
- 强：「绝对不要编造」→ 模型会激活"宁可拒答"的策略。

prompt engineering 的诀窍之一就是：**用确定性的命令式动词，避免一切弱化语**。

---

## 5️⃣ 🧪 动手实验

依次跑：

```bash
# 0. 一次性配置环境（首次）
cp .env.example .env  &&  vi .env   # 填入真实 MIMO_API_KEY

# 1. 跑全部 4 个 demo
.venv/bin/python lessons/v03_llm_rag.py

# 2. 单独跑某个 demo
.venv/bin/python lessons/v03_llm_rag.py compare-mock
.venv/bin/python lessons/v03_llm_rag.py hallucination
.venv/bin/python lessons/v03_llm_rag.py usage
.venv/bin/python lessons/v03_llm_rag.py stream
```

观察重点（对照 [lesson-03-run-log.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-03-run-log.md)）：

1. **Demo 2 最有戏剧性**：同一道"什么是 RAG?"问题，无上下文 vs 有上下文的回答**风格、措辞、可追溯性差异**；
2. **Demo 3 看成本**：3 个 query 总价大约 ¥0.01 量级，扩到 1 万 query 就是 ¥30——这是评估"RAG 真上线一天烧多少钱"的入门数学；
3. **Demo 4 看延迟**：流式从看到第一个字到看完整答案的时间分布，是体验设计的关键。

---

## 6️⃣ 🤔 思考题

1. 如果你的 KB 里同一个事实有两个互相矛盾的版本（比如 doc-A 说 CEO 是 Tim Cook，doc-B 说是 Steve Jobs），LLM 会怎么处理？怎么用 prompt / retrieve 抑制这个问题？
2. 如何让 LLM 输出 JSON 结构化结果（doc_id 列表 + 答案 + 置信度），而不是自由文本？提示：搜 `response_format={"type": "json_object"}`，但要注意 MiMo 的兼容性。
3. 如果一个 query 检索结果全部低于 threshold，你会让 LLM "诚实拒答" 还是 "走裸 LLM 兜底"？两种策略的产品收益差异是什么？

---

## 7️⃣ 🎯 v0.4 预告：让 RAG "吃下"真实文档

到目前为止，KB 还是手写的 6 篇文本字典。下一课我们要解决：

- 怎么读 PDF / Markdown / DOCX；
- 怎么切分长文档（chunking 的数学：句子边界 / 滑动窗口 / 语义切分）；
- chunk size 与召回率 / 成本的权衡；
- 切分后的 metadata（来源页码、章节）怎么沉到 prompt 里。

完成 v0.4 后，你的 RAG 就能读你的笔记、论文、合同了。
