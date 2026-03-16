import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ChunkPreviewRequest, ChunkPreviewResponse, RagOverview } from "@mist-rag/shared";
import fallbackOverview from "@mist-rag/data";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const SAMPLE_DOCUMENT = `# RAG 学习样例

RAG 的第一步不是调模型，而是先弄清楚你准备喂给系统什么内容。
如果原始文档结构混乱、正文和噪声混在一起，后面的检索与生成质量通常都会被拖低。

## 为什么要切块

长文档不能直接整篇拿去做检索，所以需要把内容切成较小的语义单元。
chunk 太大，会让召回结果变得笼统；chunk 太小，又会打断上下文。
overlap 的作用是在相邻 chunk 之间保留一点上下文连续性。

## 这一步要观察什么

你应该重点观察三件事：
1. 每个 chunk 的边界是不是刚好切在段落或句子附近；
2. overlap 是否真的保留了必要上下文；
3. 切块参数变化后，总 chunk 数量和单块长度如何变化。`;

const DEFAULT_REQUEST: ChunkPreviewRequest = {
  title: "rag-learning-note.md",
  sourceType: "md",
  content: SAMPLE_DOCUMENT,
  chunkSize: 280,
  chunkOverlap: 60,
};

type LoadStatus = "loading" | "online" | "fallback";
type PreviewStatus = "idle" | "loading" | "success" | "error";

export default function App() {
  const [overview, setOverview] = useState<RagOverview>(fallbackOverview as RagOverview);
  const [overviewStatus, setOverviewStatus] = useState<LoadStatus>("loading");
  const [previewRequest, setPreviewRequest] = useState<ChunkPreviewRequest>(DEFAULT_REQUEST);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<string>("");
  const [previewResult, setPreviewResult] = useState<ChunkPreviewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/overview`);
        if (!response.ok) {
          throw new Error(`Unexpected status ${response.status}`);
        }

        const data = (await response.json()) as RagOverview;
        if (!cancelled) {
          setOverview(data);
          setOverviewStatus("online");
        }
      } catch {
        if (!cancelled) {
          setOverview(fallbackOverview as RagOverview);
          setOverviewStatus("fallback");
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void runPreview(DEFAULT_REQUEST);
  }, []);

  async function runPreview(request: ChunkPreviewRequest) {
    setPreviewStatus("loading");
    setPreviewError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as ChunkPreviewResponse;
      setPreviewResult(data);
      setPreviewStatus("success");
    } catch (error) {
      setPreviewStatus("error");
      setPreviewError(error instanceof Error ? error.message : "Chunk preview failed.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runPreview(previewRequest);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = await file.text();
    const sourceType = file.name.endsWith(".md") ? "md" : "txt";
    setPreviewRequest((current) => ({
      ...current,
      title: file.name,
      sourceType,
      content,
    }));

    event.target.value = "";
  }

  function updateRequest<K extends keyof ChunkPreviewRequest>(key: K, value: ChunkPreviewRequest[K]) {
    setPreviewRequest((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero__copy">
          <span className={`status-pill status-pill--${overviewStatus}`}>
            {overviewStatus === "online"
              ? "API online"
              : overviewStatus === "fallback"
                ? "Using local dataset"
                : "Loading"}
          </span>
          <p className="eyebrow">Sprint 1.5 / Ingest lab</p>
          <h1>{overview.hero.title}</h1>
          <p className="hero__subtitle">{overview.hero.subtitle}</p>
        </div>

        <div className="hero__panel">
          <h2>当前交付边界</h2>
          <ul>
            <li>学习首页继续保留 RAG 全链路说明</li>
            <li>新增文档输入、参数调节和 chunk 预览实验区</li>
            <li>API 提供真实切块接口，浏览器端通过跨域访问打通</li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__heading">
          <p className="eyebrow">RAG pipeline</p>
          <h2>从文档到答案的 6 个可观察节点</h2>
        </div>
        <div className="flow-grid">
          {overview.flow.map((node, index) => (
            <article key={node.id} className="flow-card">
              <div className="flow-card__header">
                <span className="flow-card__index">{String(index + 1).padStart(2, "0")}</span>
                <h3>{node.title}</h3>
              </div>
              <p>{node.summary}</p>
              <dl>
                <div>
                  <dt>学习重点</dt>
                  <dd>{node.learningFocus}</dd>
                </div>
                <div>
                  <dt>阶段输出</dt>
                  <dd>{node.output}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section lab">
        <div className="section__heading">
          <p className="eyebrow">Chunk lab</p>
          <h2>上传文本并实时观察切块结果</h2>
        </div>

        <div className="lab__grid">
          <form className="lab-panel" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="title">文档标题</label>
              <input
                id="title"
                value={previewRequest.title}
                onChange={(event) => updateRequest("title", event.target.value)}
                maxLength={120}
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="sourceType">文档类型</label>
                <select
                  id="sourceType"
                  value={previewRequest.sourceType}
                  onChange={(event) => updateRequest("sourceType", event.target.value as "txt" | "md")}
                >
                  <option value="md">Markdown</option>
                  <option value="txt">Plain text</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="fileInput">导入文件</label>
                <input id="fileInput" type="file" accept=".md,.txt,text/markdown,text/plain" onChange={handleFileChange} />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="content">文档内容</label>
              <textarea
                id="content"
                value={previewRequest.content}
                onChange={(event) => updateRequest("content", event.target.value)}
                rows={16}
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="chunkSize">Chunk size</label>
                <input
                  id="chunkSize"
                  type="number"
                  min={120}
                  max={1200}
                  step={20}
                  value={previewRequest.chunkSize}
                  onChange={(event) => updateRequest("chunkSize", Number(event.target.value))}
                />
              </div>

              <div className="form-field">
                <label htmlFor="chunkOverlap">Chunk overlap</label>
                <input
                  id="chunkOverlap"
                  type="number"
                  min={0}
                  max={400}
                  step={10}
                  value={previewRequest.chunkOverlap}
                  onChange={(event) => updateRequest("chunkOverlap", Number(event.target.value))}
                />
              </div>
            </div>

            <div className="lab-actions">
              <button className="primary-button" type="submit" disabled={previewStatus === "loading"}>
                {previewStatus === "loading" ? "生成中..." : "生成切块预览"}
              </button>
              <p className="helper-text">建议先观察 chunk 数量、每块长度和边界位置是否稳定。</p>
            </div>
          </form>

          <section className="lab-panel lab-panel--result">
            <div className="lab-result__header">
              <div>
                <p className="eyebrow">Preview</p>
                <h3>切块结果</h3>
              </div>
              <span className={`status-pill status-pill--${previewStatus === "error" ? "fallback" : "online"}`}>
                {previewStatus}
              </span>
            </div>

            {previewError ? <p className="error-text">{previewError}</p> : null}

            {previewResult ? (
              <>
                <div className="stats-grid">
                  <article className="stat-card">
                    <span>Chunk 数量</span>
                    <strong>{previewResult.stats.totalChunks}</strong>
                  </article>
                  <article className="stat-card">
                    <span>平均长度</span>
                    <strong>{previewResult.stats.averageChunkLength} chars</strong>
                  </article>
                  <article className="stat-card">
                    <span>文档字符数</span>
                    <strong>{previewResult.document.charCount}</strong>
                  </article>
                </div>

                <div className="chunk-list">
                  {previewResult.chunks.map((chunk, index) => (
                    <article key={chunk.id} className="chunk-card">
                      <div className="chunk-card__meta">
                        <strong>Chunk {index + 1}</strong>
                        <span>
                          offset {chunk.startOffset}-{chunk.endOffset}
                        </span>
                        <span>{chunk.tokenCount} tokens</span>
                      </div>
                      <pre>{chunk.text}</pre>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="helper-text">API 返回后会在这里展示 chunk 预览。</p>
            )}
          </section>
        </div>
      </section>

      <section className="section section--split">
        <div>
          <div className="section__heading">
            <p className="eyebrow">Glossary</p>
            <h2>第一批术语卡片</h2>
          </div>
          <div className="glossary-list">
            {overview.glossary.map((item) => (
              <article key={item.term} className="glossary-card">
                <h3>{item.term}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="section__heading">
            <p className="eyebrow">Execution</p>
            <h2>Sprint 1 交付清单</h2>
          </div>
          <div className="milestone-list">
            {overview.sprintOne.map((milestone) => (
              <article key={milestone.name} className="milestone-card">
                <h3>{milestone.name}</h3>
                <p>{milestone.goal}</p>
                <ul>
                  {milestone.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
