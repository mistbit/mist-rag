---
title: 第 1 课 · 运行日志与现象观察
section: v0.1 · 第一阶段：最小 RAG
description: 5 个查询的真实运行结果，把"关键词检索的硬伤"用证据钉在课堂上
---

> 这份日志是 [v01_keyword_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v01_keyword_rag.py) 在本地的真实运行结果，
> 用于学习时回顾，并把"关键词检索的硬伤"用具体证据钉在课堂上。

## ✅ 运行成功的查询

### Q1: 什么是 RAG？
```
🔎 检索结果：
   - doc-001 (score=4)  ← ✅ 命中正确文档
   - doc-002 (score=3)
   - doc-005 (score=3)
```
**点评**：能命中目标文档，但 doc-002、doc-005 也被打了高分（"是"、"的"等高频字刷分）。

### Q3: 向量数据库有哪些？
```
🔎 检索结果：
   - doc-002 (score=6)  ← ✅ 命中正确文档（领先优势明显）
   - doc-004 (score=3)
   - doc-001 (score=1)
```
**点评**：这次表现不错，因为"向量数据库"这个词组在 doc-002 中字符密集匹配。

---

## ❌ 暴露问题的查询（这才是本课的教学高潮）

### Q4: 苹果公司的 CEO 是谁？
```
🔎 检索结果：
   - doc-006 (score=7)  ← 居然命中了！但纯属"撞大运"
```

**为什么是"撞大运"？**
- `doc-006` 的内容是：`"Apple 公司目前的 CEO 是 Tim Cook..."`
- 用户问的是"**苹果**"，文档里写的是"**Apple**"
- "苹果" 这两个字 **没有任何一个字** 在文档中出现
- score=7 全部来自于 `公`、`司`、`是`、`谁`、`的`、`C`、`E`、`O` 这些**通用字**
- **如果文档里没有"是""谁"这些通用字**，这个查询就会彻底失败

> 💡 这就是关键词法的**根本缺陷**：它无法理解 `苹果 ≈ Apple` 的语义关系。
> 这正是 v0.2 引入 Embedding 的根本动机。

---

### Q5: 什么是 RGA？（故意打错字）
```
🔎 检索结果：
   - doc-001 (score=4)  ← 居然还能命中！但...
```

**这看起来"成功"了，但其实更糟**：
- 用户输入的是错别字 `RGA`
- 但因为 `r`、`g`、`a` 三个字符碰巧也在 `RAG` 中出现
- 所以打了 3 分（再加上"是"、"什"等通用字凑出 4 分）
- **如果用户拼成 `XYZ`，关键词法就彻底失效**
- 而 Embedding 模型有"形近字"鲁棒性

---

### Q2: BM25 是什么？
```
🔎 检索结果：
   - doc-003 (score=5)  ← ✅ 第一名正确
   - doc-006 (score=4)  ← ❌ 第二名是 Apple CEO 的文档！
   - doc-005 (score=3)
```

**典型的"高频字刷分"现象**：
- doc-006（关于 Apple CEO）和 BM25 毫无关系，但因为：
  - "是"、"什"、"么"、"2"、"5" 等通用字命中
  - score 高达 4，仅次于真正相关的 doc-003
- 在生产环境，**这种"假相关"会污染 LLM 的上下文**，导致幻觉

> 💡 这暴露了：关键词法**缺少 IDF（逆文档频率）惩罚**，无法压制停用词的影响。
> BM25 算法（v0.6 课）就是来解决这个问题的。

---

## 🎯 本课结论汇总

| 现象 | 原因 | 解决方案（后续课程） |
|---|---|---|
| 同义词不匹配（苹果≠Apple）| 字符级匹配无语义 | **v0.2 Embedding** |
| 错别字时灵时不灵 | 字符级匹配脆弱 | **v0.2 Embedding** |
| 高频字刷分（"是""的"）| 无 IDF 惩罚 | **v0.6 BM25 算法** |
| 长文档容易"假命中" | 无文档长度归一化 | **v0.6 BM25 算法** |
| 跨语言场景失效 | 字符匹配无法跨语言 | **v0.2 多语言 Embedding** |

---

## 📂 相关文件

- 教学讲义：[lesson-01-keyword-rag.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/docs/lessons/lesson-01-keyword-rag.md)
- 实现代码：[v01_keyword_rag.py](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/lessons/v01_keyword_rag.py)
- 学习大纲：[RAG_LEARNING_OUTLINE.md](file:///Users/masamiyui/OpenSoureProjects/Forks/mist-rag/RAG_LEARNING_OUTLINE.md)
