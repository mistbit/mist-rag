import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type {
  ChunkPreviewRequest,
  ChunkPreviewResponse,
  ChunkRunCatalogResponse,
  ChunkRunRecord,
  DocumentCatalogResponse,
  DocumentRecord,
  RagOverview,
} from "@mist-rag/shared";
import fallbackOverview from "@mist-rag/data";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const SAMPLE_DOCUMENT = `# RAG 学习样例

RAG 的第一步不是调模型，而是先弄清楚你准备喂给系统什么内容。
如果原始文档结构混乱、正文和噪声混在一起，后面的检索与生成质量通常都会被拖低。

## 为什么要切块

长文档不能直接整篇拿去做检索，所以需要把内容切成较小的语义单元。
chunk 太大，会让召回结果变得笼统；chunk 太小，又会打断上下文。
overlap 的作用是在相邻 chunk 之间保留一点上下文连续性。`;

const DEFAULT_REQUEST: ChunkPreviewRequest = {
  title: "rag-learning-note.md",
  sourceType: "md",
  content: SAMPLE_DOCUMENT,
  chunkSize: 280,
  chunkOverlap: 60,
};

const EMPTY_CATALOG: DocumentCatalogResponse = {
  samples: [],
  saved: [],
};

const EMPTY_RUN_CATALOG: ChunkRunCatalogResponse = {
  runs: [],
};

type LoadStatus = "loading" | "online" | "fallback";
type AsyncStatus = "idle" | "loading" | "online" | "saved" | "error";
type PreviewStatus = "idle" | "loading" | "success" | "error";

export default function App() {
  const [overview, setOverview] = useState<RagOverview>(fallbackOverview as RagOverview);
  const [overviewStatus, setOverviewStatus] = useState<LoadStatus>("loading");
  const [documentCatalog, setDocumentCatalog] = useState<DocumentCatalogResponse>(EMPTY_CATALOG);
  const [documentCatalogStatus, setDocumentCatalogStatus] = useState<AsyncStatus>("loading");
  const [documentCatalogError, setDocumentCatalogError] = useState("");
  const [runCatalog, setRunCatalog] = useState<ChunkRunCatalogResponse>(EMPTY_RUN_CATALOG);
  const [runCatalogStatus, setRunCatalogStatus] = useState<AsyncStatus>("loading");
  const [runCatalogError, setRunCatalogError] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [previewRequest, setPreviewRequest] = useState<ChunkPreviewRequest>(DEFAULT_REQUEST);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState("");
  const [previewResult, setPreviewResult] = useState<ChunkPreviewResponse | null>(null);
  const [documentSaveStatus, setDocumentSaveStatus] = useState<AsyncStatus>("idle");
  const [documentSaveMessage, setDocumentSaveMessage] = useState("");
  const [runSaveStatus, setRunSaveStatus] = useState<AsyncStatus>("idle");
  const [runSaveMessage, setRunSaveMessage] = useState("");

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
    void loadDocumentCatalog();
    void loadRunCatalog();
    void runPreview(DEFAULT_REQUEST);
  }, []);

  async function loadDocumentCatalog() {
    setDocumentCatalogStatus("loading");
    setDocumentCatalogError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as DocumentCatalogResponse;
      setDocumentCatalog(data);
      setDocumentCatalogStatus("online");
    } catch (error) {
      setDocumentCatalogStatus("error");
      setDocumentCatalogError(error instanceof Error ? error.message : "Unable to load document catalog.");
    }
  }

  async function loadRunCatalog() {
    setRunCatalogStatus("loading");
    setRunCatalogError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-runs`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as ChunkRunCatalogResponse;
      setRunCatalog(data);
      setRunCatalogStatus("online");
    } catch (error) {
      setRunCatalogStatus("error");
      setRunCatalogError(error instanceof Error ? error.message : "Unable to load chunk history.");
    }
  }

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

  function resetSelections() {
    setSelectedDocumentId(null);
    setSelectedRunId(null);
    setPreviewResult(null);
    setPreviewStatus("idle");
    setPreviewError("");
    setDocumentSaveStatus("idle");
    setDocumentSaveMessage("");
    setRunSaveStatus("idle");
    setRunSaveMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedRunId(null);
    await runPreview(previewRequest);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = await file.text();
    const sourceType = file.name.endsWith(".md") ? "md" : "txt";
    resetSelections();
    setPreviewRequest((current) => ({
      ...current,
      title: file.name,
      sourceType,
      content,
    }));

    event.target.value = "";
  }

  function updateRequest<K extends keyof ChunkPreviewRequest>(key: K, value: ChunkPreviewRequest[K]) {
    resetSelections();
    setPreviewRequest((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleDocumentSelect(documentId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const document = (await response.json()) as DocumentRecord;
      const nextRequest: ChunkPreviewRequest = {
        ...previewRequest,
        title: document.title,
        sourceType: document.sourceType === "txt" ? "txt" : "md",
        content: document.content,
      };

      setPreviewRequest(nextRequest);
      setSelectedDocumentId(document.id);
      setSelectedRunId(null);
      setDocumentSaveStatus("idle");
      setDocumentSaveMessage(document.origin === "sample" ? "已载入样例文档。" : "已载入已保存文档。");
      setRunSaveStatus("idle");
      setRunSaveMessage("");
      await runPreview(nextRequest);
    } catch (error) {
      setDocumentSaveStatus("error");
      setDocumentSaveMessage(error instanceof Error ? error.message : "Unable to load document.");
    }
  }

  async function handleRunSelect(runId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-runs/${runId}`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const run = (await response.json()) as ChunkRunRecord;
      setSelectedRunId(run.id);
      setSelectedDocumentId(run.documentId ?? null);
      setPreviewRequest(run.previewRequest);
      setPreviewResult(run.previewResponse);
      setPreviewStatus("success");
      setPreviewError("");
      setRunSaveStatus("saved");
      setRunSaveMessage("已载入历史切块记录。");
    } catch (error) {
      setRunSaveStatus("error");
      setRunSaveMessage(error instanceof Error ? error.message : "Unable to load chunk run.");
    }
  }

  async function handleSaveDocument() {
    setDocumentSaveStatus("loading");
    setDocumentSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: previewRequest.title,
          sourceType: previewRequest.sourceType,
          content: previewRequest.content,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const document = (await response.json()) as DocumentRecord;
      setSelectedDocumentId(document.id);
      setDocumentSaveStatus("saved");
      setDocumentSaveMessage(`已保存为 ${document.title}`);
      await loadDocumentCatalog();
    } catch (error) {
      setDocumentSaveStatus("error");
      setDocumentSaveMessage(error instanceof Error ? error.message : "Unable to save document.");
    }
  }

  async function handleSaveChunkRun() {
    if (!previewResult) {
      return;
    }

    setRunSaveStatus("loading");
    setRunSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: previewRequest.title,
          documentId: selectedDocumentId,
          previewRequest,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const run = (await response.json()) as ChunkRunRecord;
      setSelectedRunId(run.id);
      setRunSaveStatus("saved");
      setRunSaveMessage(`已保存切块记录 ${run.id}`);
      await loadRunCatalog();
    } catch (error) {
      setRunSaveStatus("error");
      setRunSaveMessage(error instanceof Error ? error.message : "Unable to save chunk run.");
    }
  }

  function renderDocumentSection(title: string, items: DocumentCatalogResponse["samples"]) {
    return (
      <section className="document-section">
        <div className="document-section__header">
          <h3>{title}</h3>
          <span>{items.length}</span>
        </div>
        {items.length === 0 ? (
          <p className="helper-text">当前没有文档。</p>
        ) : (
          <div className="document-list">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`document-card ${selectedDocumentId === item.id ? "document-card--active" : ""}`}
                onClick={() => void handleDocumentSelect(item.id)}
              >
                <div className="document-card__meta">
                  <strong>{item.title}</strong>
                  <span>{item.origin === "sample" ? "Sample" : "Saved"}</span>
                </div>
                <p>{item.excerpt}</p>
                <div className="document-card__footer">
                  <span>{item.sourceType.toUpperCase()}</span>
                  <span>{item.charCount} chars</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    );
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
          <p className="eyebrow">Sprint 2.5 / Chunk history</p>
          <h1>{overview.hero.title}</h1>
          <p className="hero__subtitle">{overview.hero.subtitle}</p>
        </div>

        <div className="hero__panel">
          <h2>当前交付边界</h2>
          <ul>
            <li>保留学习首页、文档库和切块预览实验区</li>
            <li>新增切块历史记录的保存与回看</li>
            <li>同一页里可以在文档、参数和历史记录之间来回切换</li>
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
          <p className="eyebrow">Ingest lab</p>
          <h2>文档、preview 和历史回看形成一个实验闭环</h2>
        </div>

        <div className="lab__grid">
          <div className="lab__stack">
            <section className="lab-panel">
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Document library</p>
                  <h3>样例与已保存文档</h3>
                </div>
                <span className={`status-pill status-pill--${documentCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {documentCatalogStatus}
                </span>
              </div>

              <div className="lab-actions">
                <button type="button" className="secondary-button" onClick={() => void loadDocumentCatalog()}>
                  刷新列表
                </button>
                <p className="helper-text">保存后的文档会进入本地持久化列表，重启 API 后仍可加载。</p>
              </div>

              {documentCatalogError ? <p className="error-text">{documentCatalogError}</p> : null}
              {renderDocumentSection("样例数据集", documentCatalog.samples)}
              {renderDocumentSection("已保存文档", documentCatalog.saved)}
            </section>

            <section className="lab-panel">
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Chunk history</p>
                  <h3>已保存的切块记录</h3>
                </div>
                <span className={`status-pill status-pill--${runCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {runCatalogStatus}
                </span>
              </div>

              <div className="lab-actions">
                <button type="button" className="secondary-button" onClick={() => void loadRunCatalog()}>
                  刷新历史
                </button>
                <p className="helper-text">历史记录会保存当时的文档标题、切块参数和完整 chunk 结果。</p>
              </div>

              {runCatalogError ? <p className="error-text">{runCatalogError}</p> : null}

              {runCatalog.runs.length === 0 ? (
                <p className="helper-text">还没有保存过切块记录。</p>
              ) : (
                <div className="document-list">
                  {runCatalog.runs.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className={`document-card ${selectedRunId === run.id ? "document-card--active" : ""}`}
                      onClick={() => void handleRunSelect(run.id)}
                    >
                      <div className="document-card__meta">
                        <strong>{run.title}</strong>
                        <span>{run.totalChunks} chunks</span>
                      </div>
                      <p>
                        chunkSize {run.chunkSize} / overlap {run.chunkOverlap}
                      </p>
                      <div className="document-card__footer">
                        <span>{run.charCount} chars</span>
                        <span>{run.createdAt.replace("T", " ").slice(0, 16)} UTC</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <form className="lab-panel" onSubmit={handleSubmit}>
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Editor</p>
                  <h3>编辑当前文档</h3>
                </div>
                <span className={`status-pill status-pill--${documentSaveStatus === "error" ? "fallback" : "online"}`}>
                  {documentSaveStatus}
                </span>
              </div>

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
                  <input
                    id="fileInput"
                    type="file"
                    accept=".md,.txt,text/markdown,text/plain"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="content">文档内容</label>
                <textarea
                  id="content"
                  value={previewRequest.content}
                  onChange={(event) => updateRequest("content", event.target.value)}
                  rows={15}
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
                <button
                  className="secondary-button"
                  type="button"
                  disabled={documentSaveStatus === "loading"}
                  onClick={() => void handleSaveDocument()}
                >
                  {documentSaveStatus === "loading" ? "保存中..." : "保存当前文档"}
                </button>
              </div>

              {documentSaveMessage ? (
                <p className={documentSaveStatus === "error" ? "error-text" : "helper-text"}>{documentSaveMessage}</p>
              ) : null}
            </form>
          </div>

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

            <div className="lab-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={!previewResult || runSaveStatus === "loading"}
                onClick={() => void handleSaveChunkRun()}
              >
                {runSaveStatus === "loading" ? "保存中..." : "保存本次切块记录"}
              </button>
              <p className="helper-text">保存后可从左侧历史列表重新载入当时的参数和结果。</p>
            </div>

            {runSaveMessage ? <p className={runSaveStatus === "error" ? "error-text" : "helper-text"}>{runSaveMessage}</p> : null}
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
