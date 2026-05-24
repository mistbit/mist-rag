# mist-rag · RAG 引擎从零到一

> 一份循序渐进的 RAG（Retrieval-Augmented Generation）学习路线，
> 从最朴素的关键词匹配开始，逐步构建一个完整、工程化的 RAG 引擎。

## 📚 在线阅读

- **教程站点**：<https://mistbit.github.io/mist-rag/>（推送到 main 分支后自动部署）
- **学习大纲**：[RAG_LEARNING_OUTLINE.md](./RAG_LEARNING_OUTLINE.md)

## 🗂️ 项目结构

```
mist-rag/
├── _config.yml                      ← Jekyll 站点配置
├── _layouts/default.html            ← 书本风格统一模板
├── assets/{css,js}                  ← 站点样式与脚本
├── index.md                         ← 站点首页
├── RAG_LEARNING_OUTLINE.md          ← 学习大纲
├── docs/lessons/                    ← 各课讲义（Markdown）
│   ├── lesson-01-keyword-rag.md
│   └── lesson-01-run-log.md
├── lessons/                         ← 各课可运行 Python 代码
│   └── v01_keyword_rag.py
├── requirements.txt                 ← Python 依赖（按课启用）
├── Gemfile                          ← Jekyll 依赖
└── .github/workflows/pages.yml      ← GitHub Pages 自动部署
```

## 🏃 本地预览教程站点

### 方式 1：极简（无需 Ruby，看 95% 的样子）
直接用 Python 起个静态服务器（注意：Jekyll 模板语法不会被渲染，仅作内容预览）：

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000
```

### 方式 2：完整（推荐，与 GitHub Pages 渲染完全一致）

```bash
# 一次性安装 Ruby 依赖
bundle install

# 启动本地 Jekyll 开发服务器（修改 markdown 自动热更新）
bundle exec jekyll serve

# 访问 http://localhost:4000/mist-rag/
```

> 没有 `bundle` 的话先安装：`gem install bundler` （macOS 需要 Ruby ≥ 3.0，可用 `brew install ruby`）

## 🧪 跑课程代码

```bash
# 第 1 课：关键词伪 RAG（无需任何依赖）
python3 lessons/v01_keyword_rag.py
```

后续课程会逐步启用 [requirements.txt](./requirements.txt) 中被注释的依赖。

## 🚀 部署到 GitHub Pages

仓库已经配置好 [pages.yml](./.github/workflows/pages.yml)，**只需在 GitHub 仓库设置中开启一次**：

1. 进入仓库 → **Settings** → **Pages**
2. **Source** 选择 `GitHub Actions`
3. 推送任意 commit 到 `main`，Action 会自动构建并部署

## 📄 License

MIT
