import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type {
  ChunkPreviewRequest,
  ChunkPreviewResponse,
  ChunkRunCatalogResponse,
  ChunkRunRecord,
  CreateIndexBuildRequest,
  DocumentCatalogResponse,
  DocumentChunkSetCatalogResponse,
  DocumentChunkSetRecord,
  DocumentRecord,
  IndexBuildCatalogResponse,
  IndexBuildRecord,
  RagOverview,
  RetrievalTraceCatalogResponse,
  RetrievalTraceRecord,
  SearchIndexBuildResponse,
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

const EMPTY_DOCUMENT_CATALOG: DocumentCatalogResponse = {
  samples: [],
  saved: [],
};

const EMPTY_RUN_CATALOG: ChunkRunCatalogResponse = {
  runs: [],
};

const EMPTY_CHUNK_SET_CATALOG: DocumentChunkSetCatalogResponse = {
  sets: [],
};

const EMPTY_INDEX_BUILD_CATALOG: IndexBuildCatalogResponse = {
  builds: [],
};

const DEFAULT_INDEX_BUILD_REQUEST: CreateIndexBuildRequest = {
  embeddingModel: "demo-hash-v1",
  vectorDimensions: 12,
};

const EMPTY_SEARCH_RESULT: SearchIndexBuildResponse | null = null;
const EMPTY_RETRIEVAL_TRACE_CATALOG: RetrievalTraceCatalogResponse = {
  traces: [],
};

type LoadStatus = "loading" | "online" | "fallback";
type AsyncStatus = "idle" | "loading" | "online" | "saved" | "error";
type PreviewStatus = "idle" | "loading" | "success" | "error";
type GuideStepId = "document" | "preview" | "results" | "index" | "search" | "trace";
type LabPresetId = "balanced" | "fine-grained" | "strict-filter";

type GuideStep = {
  id: GuideStepId;
  step: string;
  targetId: string;
  title: string;
  summary: string;
  action: string;
  testHint: string;
  resultHint: string;
  ready: boolean;
  done: boolean;
};

type LabPreset = {
  id: LabPresetId;
  label: string;
  summary: string;
  chunkSize: number;
  chunkOverlap: number;
  query: string;
  topK: number;
  scoreThreshold: number;
  expected: string;
};

const LAB_PRESETS: LabPreset[] = [
  {
    id: "balanced",
    label: "教学平衡版",
    summary: "先理解 chunk 边界和默认检索排序，适合作为第一轮学习入口。",
    chunkSize: 280,
    chunkOverlap: 60,
    query: "什么样的 chunk 更适合检索？",
    topK: 3,
    scoreThreshold: 0,
    expected: "通常会看到 chunk 数量适中，检索结果覆盖面比较平衡。",
  },
  {
    id: "fine-grained",
    label: "细粒度召回版",
    summary: "压小 chunk 并降低 overlap，观察更碎的语义单元如何改变召回排序。",
    chunkSize: 160,
    chunkOverlap: 20,
    query: "为什么 overlap 会影响上下文连续性？",
    topK: 4,
    scoreThreshold: 0.05,
    expected: "chunk 数量会上升，结果更聚焦局部句子，但连续上下文会被切得更明显。",
  },
  {
    id: "strict-filter",
    label: "高精度过滤版",
    summary: "保留更长 chunk 并提高阈值，学习过滤低分结果后会丢掉什么信息。",
    chunkSize: 420,
    chunkOverlap: 80,
    query: "什么情况下 chunk 太大？",
    topK: 2,
    scoreThreshold: 0.25,
    expected: "返回数量通常更少，但高分结果会更集中，也更容易看到被阈值过滤掉的长尾。",
  },
];

export default function App() {
  const [overview, setOverview] = useState<RagOverview>(fallbackOverview as RagOverview);
  const [overviewStatus, setOverviewStatus] = useState<LoadStatus>("loading");
  const [documentCatalog, setDocumentCatalog] = useState<DocumentCatalogResponse>(EMPTY_DOCUMENT_CATALOG);
  const [documentCatalogStatus, setDocumentCatalogStatus] = useState<AsyncStatus>("loading");
  const [documentCatalogError, setDocumentCatalogError] = useState("");
  const [runCatalog, setRunCatalog] = useState<ChunkRunCatalogResponse>(EMPTY_RUN_CATALOG);
  const [runCatalogStatus, setRunCatalogStatus] = useState<AsyncStatus>("loading");
  const [runCatalogError, setRunCatalogError] = useState("");
  const [chunkSetCatalog, setChunkSetCatalog] = useState<DocumentChunkSetCatalogResponse>(EMPTY_CHUNK_SET_CATALOG);
  const [chunkSetCatalogStatus, setChunkSetCatalogStatus] = useState<AsyncStatus>("idle");
  const [chunkSetCatalogError, setChunkSetCatalogError] = useState("");
  const [indexBuildCatalog, setIndexBuildCatalog] = useState<IndexBuildCatalogResponse>(EMPTY_INDEX_BUILD_CATALOG);
  const [indexBuildCatalogStatus, setIndexBuildCatalogStatus] = useState<AsyncStatus>("idle");
  const [indexBuildCatalogError, setIndexBuildCatalogError] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedChunkSetId, setSelectedChunkSetId] = useState<string | null>(null);
  const [selectedIndexBuildId, setSelectedIndexBuildId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [previewRequest, setPreviewRequest] = useState<ChunkPreviewRequest>(DEFAULT_REQUEST);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState("");
  const [previewResult, setPreviewResult] = useState<ChunkPreviewResponse | null>(null);
  const [documentSaveStatus, setDocumentSaveStatus] = useState<AsyncStatus>("idle");
  const [documentSaveMessage, setDocumentSaveMessage] = useState("");
  const [runSaveStatus, setRunSaveStatus] = useState<AsyncStatus>("idle");
  const [runSaveMessage, setRunSaveMessage] = useState("");
  const [chunkSetSaveStatus, setChunkSetSaveStatus] = useState<AsyncStatus>("idle");
  const [chunkSetSaveMessage, setChunkSetSaveMessage] = useState("");
  const [chunkSetLabelDraft, setChunkSetLabelDraft] = useState("");
  const [chunkSetNotesDraft, setChunkSetNotesDraft] = useState("");
  const [indexBuildActionStatus, setIndexBuildActionStatus] = useState<AsyncStatus>("idle");
  const [indexBuildActionMessage, setIndexBuildActionMessage] = useState("");
  const [indexBuildRequest, setIndexBuildRequest] = useState<CreateIndexBuildRequest>(DEFAULT_INDEX_BUILD_REQUEST);
  const [selectedIndexBuild, setSelectedIndexBuild] = useState<IndexBuildRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("什么样的 chunk 更适合检索？");
  const [searchTopK, setSearchTopK] = useState(3);
  const [searchScoreThreshold, setSearchScoreThreshold] = useState(0);
  const [searchStatus, setSearchStatus] = useState<AsyncStatus>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchResult, setSearchResult] = useState<SearchIndexBuildResponse | null>(EMPTY_SEARCH_RESULT);
  const [retrievalTraceCatalog, setRetrievalTraceCatalog] = useState<RetrievalTraceCatalogResponse>(EMPTY_RETRIEVAL_TRACE_CATALOG);
  const [retrievalTraceCatalogStatus, setRetrievalTraceCatalogStatus] = useState<AsyncStatus>("idle");
  const [retrievalTraceCatalogError, setRetrievalTraceCatalogError] = useState("");
  const [retrievalTraceStatus, setRetrievalTraceStatus] = useState<AsyncStatus>("idle");
  const [retrievalTraceMessage, setRetrievalTraceMessage] = useState("");
  const [activeGuideStepId, setActiveGuideStepId] = useState<GuideStepId>("document");
  const [selectedPresetId, setSelectedPresetId] = useState<LabPresetId | null>("balanced");

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

  async function loadDocumentChunkSets(documentId: string) {
    setChunkSetCatalogStatus("loading");
    setChunkSetCatalogError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/chunk-sets`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as DocumentChunkSetCatalogResponse;
      setChunkSetCatalog(data);
      setChunkSetCatalogStatus("online");
    } catch (error) {
      setChunkSetCatalogStatus("error");
      setChunkSetCatalogError(error instanceof Error ? error.message : "Unable to load document chunk sets.");
    }
  }

  async function loadIndexBuildCatalog(chunkSetId: string) {
    setIndexBuildCatalogStatus("loading");
    setIndexBuildCatalogError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-sets/${chunkSetId}/index-builds`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as IndexBuildCatalogResponse;
      setIndexBuildCatalog(data);
      setIndexBuildCatalogStatus("online");
    } catch (error) {
      setIndexBuildCatalogStatus("error");
      setIndexBuildCatalogError(error instanceof Error ? error.message : "Unable to load index builds.");
    }
  }

  async function loadRetrievalTraceCatalog(buildId: string) {
    setRetrievalTraceCatalogStatus("loading");
    setRetrievalTraceCatalogError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/index-builds/${buildId}/retrieval-traces`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as RetrievalTraceCatalogResponse;
      setRetrievalTraceCatalog(data);
      setRetrievalTraceCatalogStatus("online");
    } catch (error) {
      setRetrievalTraceCatalogStatus("error");
      setRetrievalTraceCatalogError(error instanceof Error ? error.message : "Unable to load retrieval traces.");
    }
  }

  function clearSelectedChunkSetContext() {
    setSelectedChunkSetId(null);
    setChunkSetSaveStatus("idle");
    setChunkSetSaveMessage("");
    setChunkSetLabelDraft("");
    setChunkSetNotesDraft("");
    clearIndexBuilds();
  }

  function clearDocumentChunkSets() {
    setChunkSetCatalog(EMPTY_CHUNK_SET_CATALOG);
    setChunkSetCatalogStatus("idle");
    setChunkSetCatalogError("");
    clearSelectedChunkSetContext();
  }

  function clearIndexBuilds() {
    setIndexBuildCatalog(EMPTY_INDEX_BUILD_CATALOG);
    setIndexBuildCatalogStatus("idle");
    setIndexBuildCatalogError("");
    setSelectedIndexBuildId(null);
    setSelectedIndexBuild(null);
    setIndexBuildActionStatus("idle");
    setIndexBuildActionMessage("");
    setSearchStatus("idle");
    setSearchMessage("");
    setSearchResult(EMPTY_SEARCH_RESULT);
    clearRetrievalTraces();
  }

  function clearRetrievalTraces() {
    setRetrievalTraceCatalog(EMPTY_RETRIEVAL_TRACE_CATALOG);
    setRetrievalTraceCatalogStatus("idle");
    setRetrievalTraceCatalogError("");
    setSelectedTraceId(null);
    setRetrievalTraceStatus("idle");
    setRetrievalTraceMessage("");
  }

  function resetSearchDraftState() {
    setSelectedTraceId(null);
    setSearchStatus("idle");
    setSearchMessage("");
    setSearchResult(EMPTY_SEARCH_RESULT);
    setRetrievalTraceStatus("idle");
    setRetrievalTraceMessage("");
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

  function resetPreviewArtifacts() {
    setSelectedRunId(null);
    setPreviewResult(null);
    setPreviewStatus("idle");
    setPreviewError("");
    setRunSaveStatus("idle");
    setRunSaveMessage("");
    clearSelectedChunkSetContext();
  }

  function resetForEditedDocument() {
    setSelectedDocumentId(null);
    setDocumentSaveStatus("idle");
    setDocumentSaveMessage("");
    resetPreviewArtifacts();
    clearDocumentChunkSets();
  }

  function resetForParameterTuning() {
    setDocumentSaveStatus("idle");
    setDocumentSaveMessage("");
    resetPreviewArtifacts();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedRunId(null);
    setSelectedChunkSetId(null);
    setRunSaveStatus("idle");
    setRunSaveMessage("");
    setChunkSetSaveStatus("idle");
    setChunkSetSaveMessage("");
    await runPreview(previewRequest);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = await file.text();
    const sourceType = file.name.endsWith(".md") ? "md" : "txt";
    resetForEditedDocument();
    setSelectedPresetId(null);
    setPreviewRequest((current) => ({
      ...current,
      title: file.name,
      sourceType,
      content,
    }));
    setActiveGuideStepId("preview");

    event.target.value = "";
  }

  function updateRequest<K extends keyof ChunkPreviewRequest>(key: K, value: ChunkPreviewRequest[K]) {
    if (key === "chunkSize" || key === "chunkOverlap") {
      resetForParameterTuning();
      setSelectedPresetId(null);
    } else {
      resetForEditedDocument();
      setSelectedPresetId(null);
    }

    setActiveGuideStepId("preview");
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
      setSelectedChunkSetId(null);
      setDocumentSaveStatus("idle");
      setDocumentSaveMessage(document.origin === "sample" ? "已载入样例文档。" : "已载入已保存文档。");
      setRunSaveStatus("idle");
      setRunSaveMessage("");
      setChunkSetSaveStatus("idle");
      setChunkSetSaveMessage("");
      clearIndexBuilds();
      await loadDocumentChunkSets(document.id);
      await runPreview(nextRequest);
      setActiveGuideStepId("preview");
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
      setSelectedChunkSetId(null);
      setPreviewRequest(run.previewRequest);
      setPreviewResult(run.previewResponse);
      setPreviewStatus("success");
      setPreviewError("");
      setRunSaveStatus("saved");
      setRunSaveMessage("已载入历史切块记录。");
      if (run.documentId) {
        await loadDocumentChunkSets(run.documentId);
      } else {
        clearDocumentChunkSets();
      }
      clearIndexBuilds();
      setActiveGuideStepId("results");
    } catch (error) {
      setRunSaveStatus("error");
      setRunSaveMessage(error instanceof Error ? error.message : "Unable to load chunk run.");
    }
  }

  async function handleDocumentChunkSetSelect(chunkSetId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-sets/${chunkSetId}`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const record = (await response.json()) as DocumentChunkSetRecord;
      setSelectedChunkSetId(record.id);
      setSelectedDocumentId(record.documentId);
      setSelectedRunId(null);
      setPreviewRequest(record.previewRequest);
      setPreviewResult(record.previewResponse);
      setPreviewStatus("success");
      setPreviewError("");
      setChunkSetLabelDraft(record.label);
      setChunkSetNotesDraft(record.notes);
      setChunkSetSaveStatus("saved");
      setChunkSetSaveMessage("已载入文档级 chunk 集合。");
      clearIndexBuilds();
      await loadIndexBuildCatalog(record.id);
      setActiveGuideStepId("index");
    } catch (error) {
      setChunkSetSaveStatus("error");
      setChunkSetSaveMessage(error instanceof Error ? error.message : "Unable to load document chunk set.");
    }
  }

  async function handleIndexBuildSelect(buildId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/index-builds/${buildId}`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const record = (await response.json()) as IndexBuildRecord;
      setSelectedIndexBuildId(record.id);
      setSelectedIndexBuild(record);
      setSearchStatus("idle");
      setSearchMessage("");
      setSearchResult(EMPTY_SEARCH_RESULT);
      clearRetrievalTraces();
      await loadRetrievalTraceCatalog(record.id);
      setIndexBuildActionStatus("saved");
      setIndexBuildActionMessage("已载入索引构建记录。");
      setActiveGuideStepId("search");
    } catch (error) {
      setIndexBuildActionStatus("error");
      setIndexBuildActionMessage(error instanceof Error ? error.message : "Unable to load index build.");
    }
  }

  async function handleDeleteDocumentChunkSet(chunkSetId: string, title: string) {
    if (!window.confirm(`删除文档级 chunk 集合 "${title}"？此操作不会删除文档本身。`)) {
      return;
    }

    setChunkSetSaveStatus("loading");
    setChunkSetSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-sets/${chunkSetId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      if (selectedChunkSetId === chunkSetId) {
        setSelectedChunkSetId(null);
        setChunkSetLabelDraft("");
        setChunkSetNotesDraft("");
        clearIndexBuilds();
      }

      setChunkSetSaveStatus("saved");
      setChunkSetSaveMessage(`已删除文档级 chunk 集合 ${title}`);
      if (selectedDocumentId) {
        await loadDocumentChunkSets(selectedDocumentId);
      } else {
        clearDocumentChunkSets();
      }
    } catch (error) {
      setChunkSetSaveStatus("error");
      setChunkSetSaveMessage(error instanceof Error ? error.message : "Unable to delete document chunk set.");
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
      await loadDocumentChunkSets(document.id);
      setActiveGuideStepId("preview");
    } catch (error) {
      setDocumentSaveStatus("error");
      setDocumentSaveMessage(error instanceof Error ? error.message : "Unable to save document.");
    }
  }

  async function handleDeleteDocument(documentId: string, title: string) {
    if (!window.confirm(`删除文档 "${title}"？此操作不会删除样例数据，但会移除本地保存记录。`)) {
      return;
    }

    setDocumentSaveStatus("loading");
    setDocumentSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      if (selectedDocumentId === documentId) {
        setSelectedDocumentId(null);
        clearDocumentChunkSets();
      }

      setDocumentSaveStatus("saved");
      setDocumentSaveMessage(`已删除文档 ${title}`);
      await loadDocumentCatalog();
    } catch (error) {
      setDocumentSaveStatus("error");
      setDocumentSaveMessage(error instanceof Error ? error.message : "Unable to delete document.");
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
      setActiveGuideStepId("results");
    } catch (error) {
      setRunSaveStatus("error");
      setRunSaveMessage(error instanceof Error ? error.message : "Unable to save chunk run.");
    }
  }

  async function handleDeleteRun(runId: string, title: string) {
    if (!window.confirm(`删除切块记录 "${title}"？此操作只会移除历史记录，不会删除文档。`)) {
      return;
    }

    setRunSaveStatus("loading");
    setRunSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-runs/${runId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      if (selectedRunId === runId) {
        setSelectedRunId(null);
      }

      setRunSaveStatus("saved");
      setRunSaveMessage(`已删除切块记录 ${title}`);
      await loadRunCatalog();
    } catch (error) {
      setRunSaveStatus("error");
      setRunSaveMessage(error instanceof Error ? error.message : "Unable to delete chunk run.");
    }
  }

  async function handleSaveDocumentChunkSet() {
    if (!previewResult || !selectedDocumentId) {
      return;
    }

    setChunkSetSaveStatus("loading");
    setChunkSetSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents/${selectedDocumentId}/chunk-sets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chunkSize: previewRequest.chunkSize,
          chunkOverlap: previewRequest.chunkOverlap,
          label: chunkSetLabelDraft,
          notes: chunkSetNotesDraft,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const record = (await response.json()) as DocumentChunkSetRecord;
      setSelectedChunkSetId(record.id);
      setChunkSetLabelDraft(record.label);
      setChunkSetNotesDraft(record.notes);
      setChunkSetSaveStatus("saved");
      setChunkSetSaveMessage(`已为文档保存 chunk 集合 ${record.id}`);
      setPreviewRequest(record.previewRequest);
      setPreviewResult(record.previewResponse);
      setPreviewStatus("success");
      clearIndexBuilds();
      await loadDocumentChunkSets(record.documentId);
      setActiveGuideStepId("index");
    } catch (error) {
      setChunkSetSaveStatus("error");
      setChunkSetSaveMessage(error instanceof Error ? error.message : "Unable to save document chunk set.");
    }
  }

  async function handleUpdateDocumentChunkSet() {
    if (!selectedChunkSetId) {
      return;
    }

    setChunkSetSaveStatus("loading");
    setChunkSetSaveMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-sets/${selectedChunkSetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: chunkSetLabelDraft,
          notes: chunkSetNotesDraft,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const record = (await response.json()) as DocumentChunkSetRecord;
      setChunkSetLabelDraft(record.label);
      setChunkSetNotesDraft(record.notes);
      setChunkSetSaveStatus("saved");
      setChunkSetSaveMessage(`已更新文档级 chunk 集合 ${record.label}`);
      if (selectedDocumentId) {
        await loadDocumentChunkSets(selectedDocumentId);
      }
    } catch (error) {
      setChunkSetSaveStatus("error");
      setChunkSetSaveMessage(error instanceof Error ? error.message : "Unable to update document chunk set.");
    }
  }

  async function handleCreateIndexBuild() {
    if (!selectedChunkSetId) {
      return;
    }

    setIndexBuildActionStatus("loading");
    setIndexBuildActionMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chunk-sets/${selectedChunkSetId}/index-builds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(indexBuildRequest),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const record = (await response.json()) as IndexBuildRecord;
      setSelectedIndexBuildId(record.id);
      setSelectedIndexBuild(record);
      setSearchStatus("idle");
      setSearchMessage("");
      setSearchResult(EMPTY_SEARCH_RESULT);
      clearRetrievalTraces();
      await loadRetrievalTraceCatalog(record.id);
      setIndexBuildActionStatus("saved");
      setIndexBuildActionMessage(`已构建索引 ${record.id}`);
      await loadIndexBuildCatalog(record.chunkSetId);
      setActiveGuideStepId("search");
    } catch (error) {
      setIndexBuildActionStatus("error");
      setIndexBuildActionMessage(error instanceof Error ? error.message : "Unable to create index build.");
    }
  }

  async function handleSearchIndexBuild() {
    if (!selectedIndexBuildId) {
      return;
    }

    setSearchStatus("loading");
    setSearchMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/index-builds/${selectedIndexBuildId}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          topK: searchTopK,
          scoreThreshold: searchScoreThreshold,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const record = (await response.json()) as SearchIndexBuildResponse;
      setSearchResult(record);
      setSearchStatus("saved");
      setSearchMessage(`已返回 top ${record.results.length} 检索结果。`);
      setActiveGuideStepId("trace");
    } catch (error) {
      setSearchStatus("error");
      setSearchMessage(error instanceof Error ? error.message : "Unable to search index build.");
    }
  }

  async function handleSaveRetrievalTrace() {
    if (!selectedIndexBuildId) {
      return;
    }

    setRetrievalTraceStatus("loading");
    setRetrievalTraceMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/index-builds/${selectedIndexBuildId}/retrieval-traces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          topK: searchTopK,
          scoreThreshold: searchScoreThreshold,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      const trace = (await response.json()) as RetrievalTraceRecord;
      setSelectedTraceId(trace.id);
      setSearchResult(trace.searchResponse);
      setRetrievalTraceStatus("saved");
      setRetrievalTraceMessage(`已保存检索轨迹 ${trace.id}`);
      await loadRetrievalTraceCatalog(trace.buildId);
      setActiveGuideStepId("trace");
    } catch (error) {
      setRetrievalTraceStatus("error");
      setRetrievalTraceMessage(error instanceof Error ? error.message : "Unable to save retrieval trace.");
    }
  }

  async function handleRetrievalTraceSelect(traceId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/retrieval-traces/${traceId}`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const trace = (await response.json()) as RetrievalTraceRecord;
      setSelectedTraceId(trace.id);
      setSelectedIndexBuildId(trace.buildId);
      setSearchQuery(trace.searchResponse.query);
      setSearchTopK(trace.searchResponse.topK);
      setSearchScoreThreshold(trace.searchResponse.scoreThreshold);
      setSearchResult(trace.searchResponse);
      setSearchStatus("saved");
      setSearchMessage(`已载入检索轨迹 ${trace.id}`);
      setRetrievalTraceStatus("saved");
      setRetrievalTraceMessage("已载入检索轨迹。");
      setActiveGuideStepId("trace");
    } catch (error) {
      setRetrievalTraceStatus("error");
      setRetrievalTraceMessage(error instanceof Error ? error.message : "Unable to load retrieval trace.");
    }
  }

  async function handleDeleteRetrievalTrace(traceId: string, query: string) {
    if (!window.confirm(`删除检索轨迹 "${query}"？此操作只会移除历史记录。`)) {
      return;
    }

    setRetrievalTraceStatus("loading");
    setRetrievalTraceMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/retrieval-traces/${traceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Unexpected status ${response.status}`);
      }

      if (selectedTraceId === traceId) {
        setSelectedTraceId(null);
      }

      setRetrievalTraceStatus("saved");
      setRetrievalTraceMessage("已删除检索轨迹。");
      if (selectedIndexBuildId) {
        await loadRetrievalTraceCatalog(selectedIndexBuildId);
      } else {
        clearRetrievalTraces();
      }
    } catch (error) {
      setRetrievalTraceStatus("error");
      setRetrievalTraceMessage(error instanceof Error ? error.message : "Unable to delete retrieval trace.");
    }
  }

  const allDocuments = [...documentCatalog.samples, ...documentCatalog.saved];
  const selectedDocumentSummary = allDocuments.find((item) => item.id === selectedDocumentId) ?? null;
  const selectedChunkSetSummary = chunkSetCatalog.sets.find((item) => item.id === selectedChunkSetId) ?? null;
  const selectedIndexBuildSummary =
    indexBuildCatalog.builds.find((item) => item.id === selectedIndexBuildId) ?? selectedIndexBuild ?? null;
  const selectedTraceSummary = retrievalTraceCatalog.traces.find((item) => item.id === selectedTraceId) ?? null;
  const selectedPreset = LAB_PRESETS.find((preset) => preset.id === selectedPresetId) ?? null;
  const hasPreviewResult = previewStatus === "success" && Boolean(previewResult);
  const hasSavedResultAsset =
    runCatalog.runs.length > 0 ||
    chunkSetCatalog.sets.length > 0 ||
    runSaveStatus === "saved" ||
    chunkSetSaveStatus === "saved";
  const hasChunkSet = Boolean(selectedChunkSetId || chunkSetCatalog.sets.length);
  const hasIndexBuild = Boolean(selectedIndexBuildId || indexBuildCatalog.builds.length);
  const hasSearchResult = Boolean(searchResult);
  const hasTrace = Boolean(selectedTraceId || retrievalTraceCatalog.traces.length);

  const guideSteps: GuideStep[] = [
    {
      id: "document",
      step: "01",
      targetId: "guide-document",
      title: "选中学习文档",
      summary: "先从样例文档开始，理解后续所有状态都围绕哪一篇文档展开。",
      action: "从左侧文档库点开一篇样例，或先保存你自己编辑的文档。",
      testHint: "先加载样例，再换成你自己的 Markdown，观察文档长度和摘要是否变化。",
      resultHint: selectedDocumentSummary ? `当前文档已锁定为「${selectedDocumentSummary.title}」` : "选中后会看到后续 chunk 集合开始和这篇文档绑定。",
      ready: true,
      done: Boolean(selectedDocumentId),
    },
    {
      id: "preview",
      step: "02",
      targetId: "guide-preview",
      title: "调整参数并生成预览",
      summary: "通过 chunkSize 和 overlap 学会切块是如何改变检索输入的。",
      action: "修改 chunk 参数后重新生成预览，重点看 chunk 数量、边界和平均长度。",
      testHint: "推荐先试 280/60，再改成 160/20，对比 chunk 数和每块内容。",
      resultHint: previewResult
        ? `你已经拿到 ${previewResult.stats.totalChunks} 个 chunk，可以继续保存成实验记录或稳定集合。`
        : "预览生成后，右侧会立刻显示 chunk 结果。",
      ready: previewRequest.content.trim().length > 0,
      done: hasPreviewResult,
    },
    {
      id: "results",
      step: "03",
      targetId: "guide-results",
      title: "保存实验结果",
      summary: "把一次性预览分成两类资产：历史记录和文档级 chunk 集合。",
      action: "先保存一次 chunk run，再把觉得稳定的结果保存为文档级 chunk 集合。",
      testHint: "保存一条 chunk run，再保存一个命名清晰的 chunk set，比如“教学版 280/60”。",
      resultHint:
        hasSavedResultAsset
          ? `当前已有 ${runCatalog.runs.length} 条切块历史、${chunkSetCatalog.sets.length} 个稳定 chunk 集合。`
          : "保存后你会在左侧看到可回放的历史和可复用的 chunk 集合。",
      ready: Boolean(previewResult),
      done: hasSavedResultAsset,
    },
    {
      id: "index",
      step: "04",
      targetId: "guide-index",
      title: "为 chunk 集合建立索引",
      summary: "索引是 query 和 chunk 进入同一向量空间的准备动作。",
      action: "选中一个 chunk 集合后，为它创建一条 index build。",
      testHint: "先用默认的 demo-hash-v1 构建，再观察向量维度、词表规模和高频词。",
      resultHint: selectedIndexBuildSummary
        ? `当前索引使用 ${selectedIndexBuildSummary.embeddingModel}，共 ${selectedIndexBuildSummary.totalVectors} 个向量。`
        : "索引建立后，你会看到向量数、维度和词表统计。",
      ready: hasChunkSet,
      done: hasIndexBuild,
    },
    {
      id: "search",
      step: "05",
      targetId: "guide-search",
      title: "运行 top-k 检索",
      summary: "把 query 投到向量空间里，观察哪些 chunk 被召回、排序为什么变。",
      action: "输入 query，调 topK 和 threshold，观察返回结果的 rank 与 score。",
      testHint: "先问一个泛问题，再换成更具体的问题，并把 threshold 从 0 调到 0.25。",
      resultHint: searchResult
        ? `当前最近一次检索返回 ${searchResult.results.length} 条结果，最高分 ${searchResult.results[0]?.score.toFixed(4) ?? "0.0000"}。`
        : "检索后你会在索引面板下方看到排序结果和 query terms。",
      ready: hasIndexBuild,
      done: hasSearchResult,
    },
    {
      id: "trace",
      step: "06",
      targetId: "guide-trace",
      title: "保存并回放 trace",
      summary: "把一次检索实验固化下来，方便后续对比 query、threshold 和结果变化。",
      action: "保存检索轨迹，然后从历史列表里重新载入一条 trace。",
      testHint: "保存两次不同 query 或不同 threshold 的检索，比较 trace 列表里的返回数量。",
      resultHint:
        retrievalTraceCatalog.traces.length > 0
          ? `当前索引下已有 ${retrievalTraceCatalog.traces.length} 条 trace。`
          : "保存后你可以反复回放同一条检索实验。",
      ready: Boolean(selectedIndexBuildId || retrievalTraceCatalog.traces.length || searchResult),
      done: hasTrace,
    },
  ];

  const completedGuideSteps = guideSteps.filter((step) => step.done).length;
  const activeGuideStep = guideSteps.find((step) => step.id === activeGuideStepId) ?? guideSteps[0];
  const recommendedGuideStep = guideSteps.find((step) => step.ready && !step.done) ?? guideSteps[guideSteps.length - 1];

  const experimentSnapshot = [
    {
      label: "当前文档",
      value: selectedDocumentSummary?.title ?? "未锁定",
      meta: selectedDocumentSummary ? `${selectedDocumentSummary.charCount} chars` : "先从文档库选择一篇",
    },
    {
      label: "Chunk 集合",
      value: selectedChunkSetSummary?.label ?? "未保存",
      meta: selectedChunkSetSummary
        ? `${selectedChunkSetSummary.totalChunks} chunks`
        : previewResult
          ? "可以从预览结果直接保存"
          : "先生成一次 preview",
    },
    {
      label: "Index build",
      value: selectedIndexBuildSummary?.embeddingModel ?? "未构建",
      meta: selectedIndexBuildSummary
        ? `${selectedIndexBuildSummary.totalVectors} vectors`
        : "索引建立后才可检索",
    },
    {
      label: "最近结果",
      value: searchResult ? `${searchResult.results.length} hits` : "未检索",
      meta: searchResult ? `topK ${searchResult.topK} / threshold ${searchResult.scoreThreshold.toFixed(2)}` : "运行一次 top-k 检索",
    },
    {
      label: "最近 trace",
      value: selectedTraceSummary?.query ?? "未保存",
      meta: selectedTraceSummary ? `${selectedTraceSummary.totalResults} results` : "保存检索轨迹后可回放",
    },
  ];

  useEffect(() => {
    const activeStep = guideSteps.find((step) => step.id === activeGuideStepId);
    if (!activeStep) {
      setActiveGuideStepId(recommendedGuideStep.id);
      return;
    }

    if (getGuideStepState(activeStep) === "locked") {
      setActiveGuideStepId(recommendedGuideStep.id);
    }
  }, [
    activeGuideStepId,
    recommendedGuideStep.id,
    selectedDocumentId,
    hasPreviewResult,
    hasSavedResultAsset,
    hasChunkSet,
    hasIndexBuild,
    hasSearchResult,
    hasTrace,
  ]);

  function getGuideStepState(step: GuideStep) {
    if (step.done) {
      return "done";
    }

    if (step.ready) {
      return "ready";
    }

    return "locked";
  }

  function focusGuideStep(stepId: GuideStepId) {
    setActiveGuideStepId(stepId);

    const step = guideSteps.find((item) => item.id === stepId);
    if (!step) {
      return;
    }

    globalThis.document?.getElementById(step.targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function applyLabPreset(presetId: LabPresetId) {
    const preset = LAB_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    resetForParameterTuning();
    resetSearchDraftState();
    setSelectedPresetId(preset.id);
    setSearchQuery(preset.query);
    setSearchTopK(preset.topK);
    setSearchScoreThreshold(preset.scoreThreshold);

    const nextRequest: ChunkPreviewRequest = {
      ...previewRequest,
      chunkSize: preset.chunkSize,
      chunkOverlap: preset.chunkOverlap,
    };

    setPreviewRequest(nextRequest);
    setActiveGuideStepId("preview");
    await runPreview(nextRequest);
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
              <article key={item.id} className={`document-card ${selectedDocumentId === item.id ? "document-card--active" : ""}`}>
                <button type="button" className="document-card__content" onClick={() => void handleDocumentSelect(item.id)}>
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
                {item.origin === "saved" ? (
                  <div className="document-card__actions">
                    <button type="button" className="danger-button" onClick={() => void handleDeleteDocument(item.id, item.title)}>
                      删除
                    </button>
                  </div>
                ) : null}
              </article>
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
          <p className="eyebrow">Sprint 6 / Retrieval traces</p>
          <h1>{overview.hero.title}</h1>
          <p className="hero__subtitle">{overview.hero.subtitle}</p>
        </div>

        <div className="hero__panel">
          <h2>当前交付边界</h2>
          <ul>
            <li>保留学习首页、文档库、preview 与 chunk 历史</li>
            <li>文档级 chunk 集合继续作为稳定输入层</li>
            <li>索引记录继续承担 embedding/index 的实验骨架</li>
            <li>新增 top-k 检索实验，直接观察 query 与 chunk 的相似度排序</li>
            <li>新增 retrieval trace history，保存 query、threshold 和结果回放</li>
            <li>同一页里可以在文档、chunk 集合、索引记录、检索结果和历史之间切换</li>
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

      <section className="section guide-board">
        <div className="guide-board__hero">
          <div className="section__heading">
            <p className="eyebrow">Guided lab</p>
            <h2>按 6 个动作完成一次可回放的 RAG 实验</h2>
            <p>从选文档开始，一路走到保存 trace。每一步都给你测试建议和预期结果，不需要自己猜下一步该点哪里。</p>
          </div>

          <article className="guide-brief">
            <span className="guide-brief__label">学习进度</span>
            <strong>
              {completedGuideSteps}/{guideSteps.length}
            </strong>
            <p>{recommendedGuideStep.action}</p>
            <p className="guide-brief__meta">
              当前预设：{selectedPreset?.label ?? "自定义参数"}
            </p>
            <button type="button" className="primary-button" onClick={() => focusGuideStep(recommendedGuideStep.id)}>
              跳到建议步骤
            </button>
          </article>
        </div>

        <div className="guide-progress">
          {guideSteps.map((step) => {
            const state = getGuideStepState(step);

            return (
              <button
                key={step.id}
                type="button"
                className={`guide-step guide-step--${state} ${activeGuideStep.id === step.id ? "guide-step--active" : ""}`}
                onClick={() => focusGuideStep(step.id)}
              >
                <span className="guide-step__index">{step.step}</span>
                <div className="guide-step__body">
                  <strong>{step.title}</strong>
                  <p>{step.summary}</p>
                </div>
                <span className="guide-step__state">
                  {state === "done" ? "已完成" : state === "ready" ? "现在可做" : "等待前一步"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="preset-grid">
          {LAB_PRESETS.map((preset) => (
            <article
              key={preset.id}
              className={`preset-card ${selectedPresetId === preset.id ? "preset-card--active" : ""}`}
            >
              <div className="preset-card__header">
                <div>
                  <span className="preset-card__eyebrow">Preset</span>
                  <h3>{preset.label}</h3>
                </div>
                <span>
                  {preset.chunkSize}/{preset.chunkOverlap}
                </span>
              </div>
              <p>{preset.summary}</p>
              <div className="preset-card__stats">
                <span>topK {preset.topK}</span>
                <span>threshold {preset.scoreThreshold.toFixed(2)}</span>
              </div>
              <p className="helper-text">{preset.expected}</p>
              <button type="button" className="secondary-button" onClick={() => void applyLabPreset(preset.id)}>
                应用这个场景
              </button>
            </article>
          ))}
        </div>

        <div className="guide-inspector">
          <article className="guide-inspector__card">
            <p className="eyebrow">Current step</p>
            <h3>
              Step {activeGuideStep.step} · {activeGuideStep.title}
            </h3>
            <p>{activeGuideStep.action}</p>
            <dl>
              <div>
                <dt>怎么测试</dt>
                <dd>{activeGuideStep.testHint}</dd>
              </div>
              <div>
                <dt>你会看到什么</dt>
                <dd>{activeGuideStep.resultHint}</dd>
              </div>
            </dl>
          </article>

          <div className="snapshot-grid">
            {experimentSnapshot.map((item) => (
              <article key={item.label} className="snapshot-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.meta}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section lab">
        <div className="section__heading">
          <p className="eyebrow">Guided workspace</p>
          <h2>工作区会跟着实验步骤推进，未到的区块会弱化显示</h2>
          <p>推荐顺序是：选文档 → 改参数看 preview → 保存结果 → 建索引 → 跑检索 → 回放 trace。</p>
        </div>

        <div className="lab__grid">
          <div className="lab__stack">
            <section id="guide-document" className="lab-panel">
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Document library</p>
                  <h3>样例与已保存文档</h3>
                </div>
                <span className={`status-pill status-pill--${documentCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {documentCatalogStatus}
                </span>
              </div>

              <div className="panel-stage">
                <span className="panel-stage__step">Step 01</span>
                <p>先选定这次实验围绕哪篇文档展开。后面的 chunk 集合、索引和 trace 都会绑定到它。</p>
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

            <form id="guide-preview" className="lab-panel" onSubmit={handleSubmit}>
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Editor</p>
                  <h3>编辑当前文档并生成 preview</h3>
                </div>
                <span className={`status-pill status-pill--${documentSaveStatus === "error" ? "fallback" : "online"}`}>
                  {documentSaveStatus}
                </span>
              </div>

              <div className="panel-stage">
                <span className="panel-stage__step">Step 02</span>
                <p>这里负责输入文本和参数。重点不是“填表”，而是反复改参数，看右侧 preview 怎么变化。</p>
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

              <div className="panel-observation">
                <strong>建议测试</strong>
                <p>先保持 280 / 60 生成一次，再改成 160 / 20。你会马上看到右侧 chunk 数量增多、边界更碎。</p>
              </div>

              {documentSaveMessage ? (
                <p className={documentSaveStatus === "error" ? "error-text" : "helper-text"}>{documentSaveMessage}</p>
              ) : null}
            </form>

            <section id="guide-chunk-set" className={`lab-panel ${!previewResult ? "lab-panel--locked" : ""}`}>
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Document chunk sets</p>
                  <h3>当前文档的持久化 chunk 集合</h3>
                </div>
                <span className={`status-pill status-pill--${chunkSetCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {chunkSetCatalogStatus}
                </span>
              </div>

              <div className="panel-stage">
                <span className="panel-stage__step">Step 03A</span>
                <p>这一区块是稳定资产层。只有你确认某组 chunk 值得长期比较时，才把它保存成文档级集合。</p>
              </div>

              <div className="lab-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedDocumentId}
                  onClick={() => (selectedDocumentId ? void loadDocumentChunkSets(selectedDocumentId) : undefined)}
                >
                  刷新集合
                </button>
                <p className="helper-text">
                  {selectedDocumentId
                    ? "这里保存的是当前文档在特定 chunk 参数下的持久化切块结果。"
                    : "先从左侧载入一个样例或已保存文档，再保存文档级 chunk 集合。"}
                </p>
              </div>

              {chunkSetCatalogError ? <p className="error-text">{chunkSetCatalogError}</p> : null}

              {chunkSetCatalog.sets.length === 0 ? (
                <p className="helper-text">当前文档还没有保存过 chunk 集合。</p>
              ) : (
                <div className="document-list">
                  {chunkSetCatalog.sets.map((record) => (
                    <article
                      key={record.id}
                      className={`document-card ${selectedChunkSetId === record.id ? "document-card--active" : ""}`}
                    >
                      <button
                        type="button"
                        className="document-card__content"
                        onClick={() => void handleDocumentChunkSetSelect(record.id)}
                      >
                        <div className="document-card__meta">
                          <strong>{record.label}</strong>
                          <span>{record.totalChunks} chunks</span>
                        </div>
                        <p>
                          {record.notes || "没有备注。"}
                        </p>
                        <p>
                          chunkSize {record.chunkSize} / overlap {record.chunkOverlap}
                        </p>
                        <div className="document-card__footer">
                          <span>{record.createdAt.replace("T", " ").slice(0, 16)} UTC</span>
                          <span>{record.id}</span>
                        </div>
                      </button>
                      <div className="document-card__actions">
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDeleteDocumentChunkSet(record.id, record.documentTitle)}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {selectedChunkSetId ? (
                <div className="chunk-set-editor">
                  <div className="form-field">
                    <label htmlFor="chunkSetLabel">集合名称</label>
                    <input
                      id="chunkSetLabel"
                      value={chunkSetLabelDraft}
                      maxLength={120}
                      onChange={(event) => setChunkSetLabelDraft(event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="chunkSetNotes">备注</label>
                    <textarea
                      id="chunkSetNotes"
                      rows={4}
                      value={chunkSetNotesDraft}
                      maxLength={500}
                      onChange={(event) => setChunkSetNotesDraft(event.target.value)}
                    />
                  </div>
                  <div className="lab-actions">
                    <button type="button" className="secondary-button" onClick={() => void handleUpdateDocumentChunkSet()}>
                      更新集合信息
                    </button>
                    <p className="helper-text">命名和备注有助于区分不同切块策略，例如“教学版 280/60”或“更高精度小块”。</p>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="lab-panel lab-panel--optional">
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Chunk history</p>
                  <h3>已保存的切块记录</h3>
                </div>
                <span className={`status-pill status-pill--${runCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {runCatalogStatus}
                </span>
              </div>

              <div className="panel-stage">
                <span className="panel-stage__step">Step 03B</span>
                <p>历史记录更偏向“实验日志”。它适合保存一次尝试，方便你后面重新载入参数对比。</p>
              </div>

              <div className="lab-actions">
                <button type="button" className="secondary-button" onClick={() => void loadRunCatalog()}>
                  刷新历史
                </button>
                <p className="helper-text">历史记录保留实验轨迹，文档级 chunk 集合则保留与文档绑定的稳定结果。</p>
              </div>

              {runCatalogError ? <p className="error-text">{runCatalogError}</p> : null}

              {runCatalog.runs.length === 0 ? (
                <p className="helper-text">还没有保存过切块记录。</p>
              ) : (
                <div className="document-list">
                  {runCatalog.runs.map((run) => (
                    <article key={run.id} className={`document-card ${selectedRunId === run.id ? "document-card--active" : ""}`}>
                      <button type="button" className="document-card__content" onClick={() => void handleRunSelect(run.id)}>
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
                      <div className="document-card__actions">
                        <button type="button" className="danger-button" onClick={() => void handleDeleteRun(run.id, run.title)}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section id="guide-index" className={`lab-panel ${!selectedChunkSetId ? "lab-panel--locked" : ""}`}>
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Index builds</p>
                  <h3>当前 chunk 集合的索引构建记录</h3>
                </div>
                <span className={`status-pill status-pill--${indexBuildCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {indexBuildCatalogStatus}
                </span>
              </div>

              <div className="panel-stage">
                <span className="panel-stage__step">Step 04</span>
                <p>选中 chunk 集合后，就可以把这组文本转换成可检索的向量快照。没有这一步，query 还无从比较。</p>
              </div>

              <div className="lab-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedChunkSetId}
                  onClick={() => (selectedChunkSetId ? void loadIndexBuildCatalog(selectedChunkSetId) : undefined)}
                >
                  刷新索引记录
                </button>
                <p className="helper-text">
                  {selectedChunkSetId
                    ? "这里展示同一 chunk 集合在不同 embedding 配置下生成的索引快照。"
                    : "先选中一个文档级 chunk 集合，再为它构建索引。"}
                </p>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="embeddingModel">Embedding model</label>
                  <input
                    id="embeddingModel"
                    value={indexBuildRequest.embeddingModel ?? ""}
                    maxLength={80}
                    onChange={(event) =>
                      setIndexBuildRequest((current) => ({
                        ...current,
                        embeddingModel: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="vectorDimensions">Vector dimensions</label>
                  <input
                    id="vectorDimensions"
                    type="number"
                    min={4}
                    max={64}
                    step={2}
                    value={indexBuildRequest.vectorDimensions ?? 12}
                    onChange={(event) =>
                      setIndexBuildRequest((current) => ({
                        ...current,
                        vectorDimensions: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="lab-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedChunkSetId || indexBuildActionStatus === "loading"}
                  onClick={() => void handleCreateIndexBuild()}
                >
                  {indexBuildActionStatus === "loading" ? "构建中..." : "为当前集合构建索引"}
                </button>
                <p className="helper-text">当前实现使用本地 `demo-hash` 向量化骨架，先把索引状态和数据结构稳定下来。</p>
              </div>

              {indexBuildCatalogError ? <p className="error-text">{indexBuildCatalogError}</p> : null}
              {indexBuildActionMessage ? (
                <p className={indexBuildActionStatus === "error" ? "error-text" : "helper-text"}>{indexBuildActionMessage}</p>
              ) : null}

              {indexBuildCatalog.builds.length === 0 ? (
                <p className="helper-text">当前 chunk 集合还没有索引构建记录。</p>
              ) : (
                <div className="document-list">
                  {indexBuildCatalog.builds.map((build) => (
                    <article
                      key={build.id}
                      className={`document-card ${selectedIndexBuildId === build.id ? "document-card--active" : ""}`}
                    >
                      <button type="button" className="document-card__content" onClick={() => void handleIndexBuildSelect(build.id)}>
                        <div className="document-card__meta">
                          <strong>{build.embeddingModel}</strong>
                          <span>{build.status}</span>
                        </div>
                        <p>
                          {build.totalVectors} vectors / {build.vectorDimensions} dims / vocab {build.vocabularySize}
                        </p>
                        <div className="document-card__footer">
                          <span>{build.createdAt.replace("T", " ").slice(0, 16)} UTC</span>
                          <span>{build.id}</span>
                        </div>
                      </button>
                    </article>
                  ))}
                </div>
              )}

              {selectedIndexBuild ? (
                <div className="index-build-detail">
                  <div className="stats-grid">
                    <article className="stat-card">
                      <span>向量数</span>
                      <strong>{selectedIndexBuild.totalVectors}</strong>
                    </article>
                    <article className="stat-card">
                      <span>向量维度</span>
                      <strong>{selectedIndexBuild.vectorDimensions}</strong>
                    </article>
                    <article className="stat-card">
                      <span>词表规模</span>
                      <strong>{selectedIndexBuild.vocabularySize}</strong>
                    </article>
                  </div>

                  <p className="helper-text">
                    平均 token 数 {selectedIndexBuild.averageTokenCount}，当前状态 {selectedIndexBuild.status}，构建模型{" "}
                    {selectedIndexBuild.embeddingModel}。
                  </p>
                  <p className="helper-text">高频词快照：{selectedIndexBuild.topTerms.join(" / ") || "暂无"}</p>

                  <div id="guide-search" className="chunk-set-editor">
                    <div className="panel-stage panel-stage--inline">
                      <span className="panel-stage__step">Step 05</span>
                      <p>在同一份索引上连续改 query、topK 和 threshold，最容易看清“召回为什么变了”。</p>
                    </div>

                    <div className="form-field">
                      <label htmlFor="searchQuery">Query</label>
                      <textarea
                        id="searchQuery"
                        className="textarea--compact"
                        rows={3}
                        maxLength={200}
                        value={searchQuery}
                        onChange={(event) => {
                          resetSearchDraftState();
                          setSelectedPresetId(null);
                          setSearchQuery(event.target.value);
                        }}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-field">
                        <label htmlFor="searchTopK">Top K</label>
                        <input
                          id="searchTopK"
                          type="number"
                          min={1}
                          max={8}
                          step={1}
                          value={searchTopK}
                          onChange={(event) => {
                            resetSearchDraftState();
                            setSelectedPresetId(null);
                            setSearchTopK(Number(event.target.value));
                          }}
                        />
                      </div>

                      <div className="form-field">
                        <label htmlFor="searchScoreThreshold">Score threshold</label>
                        <input
                          id="searchScoreThreshold"
                          type="number"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={searchScoreThreshold}
                          onChange={(event) => {
                            resetSearchDraftState();
                            setSelectedPresetId(null);
                            setSearchScoreThreshold(Number(event.target.value));
                          }}
                        />
                      </div>
                    </div>

                    <div className="lab-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={searchStatus === "loading"}
                        onClick={() => void handleSearchIndexBuild()}
                      >
                        {searchStatus === "loading" ? "检索中..." : "运行 top-k 检索"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={retrievalTraceStatus === "loading"}
                        onClick={() => void handleSaveRetrievalTrace()}
                      >
                        {retrievalTraceStatus === "loading" ? "保存中..." : "保存检索轨迹"}
                      </button>
                      <p className="helper-text">当前 query 会用和索引相同的 `demo-hash` 语义骨架向量化，再与 chunk 向量做相似度排序。</p>
                    </div>

                    {searchMessage ? <p className={searchStatus === "error" ? "error-text" : "helper-text"}>{searchMessage}</p> : null}
                    {retrievalTraceMessage ? (
                      <p className={retrievalTraceStatus === "error" ? "error-text" : "helper-text"}>{retrievalTraceMessage}</p>
                    ) : null}
                  </div>

                  <div className="vector-preview-list">
                    {selectedIndexBuild.chunkVectors.slice(0, 3).map((vector) => (
                      <article key={vector.chunkId} className="chunk-card">
                        <div className="chunk-card__meta">
                          <strong>{vector.chunkId}</strong>
                          <span>
                            offset {vector.startOffset}-{vector.endOffset}
                          </span>
                          <span>{vector.tokenCount} tokens</span>
                        </div>
                        <pre>{vector.values.slice(0, 6).map((value) => value.toFixed(3)).join(", ")}</pre>
                      </article>
                    ))}
                  </div>

                  {searchResult ? (
                    <div className="vector-preview-list">
                      <p className="helper-text">
                        Query terms: {searchResult.queryTerms.join(" / ") || "暂无"}，当前返回 top {searchResult.topK}，阈值{" "}
                        {searchResult.scoreThreshold.toFixed(2)}。
                      </p>
                      {searchResult.results.map((result) => (
                        <article key={result.chunkId} className="chunk-card">
                          <div className="chunk-card__meta">
                            <strong>Rank {result.rank}</strong>
                            <span>score {result.score.toFixed(4)}</span>
                            <span>
                              offset {result.startOffset}-{result.endOffset}
                            </span>
                            <span>{result.tokenCount} tokens</span>
                          </div>
                          <pre>{result.text}</pre>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section id="guide-trace" className={`lab-panel ${!selectedIndexBuildId ? "lab-panel--locked" : ""}`}>
              <div className="lab-result__header">
                <div>
                  <p className="eyebrow">Retrieval traces</p>
                  <h3>当前索引的检索轨迹</h3>
                </div>
                <span className={`status-pill status-pill--${retrievalTraceCatalogStatus === "error" ? "fallback" : "online"}`}>
                  {retrievalTraceCatalogStatus}
                </span>
              </div>

              <div className="panel-stage">
                <span className="panel-stage__step">Step 06</span>
                <p>当你开始比较不同 query 或不同阈值时，把它们保存成 trace，后面就能回放和复盘。</p>
              </div>

              <div className="lab-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedIndexBuildId}
                  onClick={() => (selectedIndexBuildId ? void loadRetrievalTraceCatalog(selectedIndexBuildId) : undefined)}
                >
                  刷新检索轨迹
                </button>
                <p className="helper-text">
                  {selectedIndexBuildId
                    ? "保存后的 trace 会固定记录 query、top-k、threshold 和返回结果，方便后续对比。"
                    : "先选择一个 index build，再运行检索或保存检索轨迹。"}
                </p>
              </div>

              {retrievalTraceCatalogError ? <p className="error-text">{retrievalTraceCatalogError}</p> : null}

              {retrievalTraceCatalog.traces.length === 0 ? (
                <p className="helper-text">当前索引还没有保存过检索轨迹。</p>
              ) : (
                <div className="document-list">
                  {retrievalTraceCatalog.traces.map((trace) => (
                    <article key={trace.id} className={`document-card ${selectedTraceId === trace.id ? "document-card--active" : ""}`}>
                      <button type="button" className="document-card__content" onClick={() => void handleRetrievalTraceSelect(trace.id)}>
                        <div className="document-card__meta">
                          <strong>{trace.query}</strong>
                          <span>{trace.totalResults} results</span>
                        </div>
                        <p>
                          topK {trace.topK} / threshold {trace.scoreThreshold.toFixed(2)}
                        </p>
                        <div className="document-card__footer">
                          <span>{trace.createdAt.replace("T", " ").slice(0, 16)} UTC</span>
                          <span>{trace.id}</span>
                        </div>
                      </button>
                      <div className="document-card__actions">
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDeleteRetrievalTrace(trace.id, trace.query)}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

          </div>

          <section id="guide-results" className="lab-panel lab-panel--result lab-panel--sticky">
            <div className="lab-result__header">
              <div>
                <p className="eyebrow">Preview</p>
                <h3>切块结果与即时反馈</h3>
              </div>
              <span className={`status-pill status-pill--${previewStatus === "error" ? "fallback" : "online"}`}>
                {previewStatus}
              </span>
            </div>

            <div className="panel-stage">
              <span className="panel-stage__step">Step 03</span>
              <p>右侧是你每次改参数之后最该看的地方。先看 chunk 数量和边界，再决定是否保存成历史或稳定集合。</p>
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
              <button
                className="secondary-button"
                type="button"
                disabled={!previewResult || !selectedDocumentId || chunkSetSaveStatus === "loading"}
                onClick={() => void handleSaveDocumentChunkSet()}
              >
                {chunkSetSaveStatus === "loading" ? "保存中..." : "保存为文档级 chunk 集合"}
              </button>
            </div>

            <div className="panel-observation">
              <strong>建议观察</strong>
              <p>如果 chunk 更碎，通常会出现更多更短的结果；如果 overlap 更高，相邻 chunk 的上下文连续性会更强。</p>
            </div>

            <p className="helper-text">
              {selectedDocumentId
                ? "当前 preview 可以同时保存为实验历史，或保存为绑定当前文档的 chunk 集合。"
                : "要保存为文档级 chunk 集合，先从左侧选一个样例/已保存文档，或先保存当前文档。"}
            </p>

            {runSaveMessage ? <p className={runSaveStatus === "error" ? "error-text" : "helper-text"}>{runSaveMessage}</p> : null}
            {chunkSetSaveMessage ? (
              <p className={chunkSetSaveStatus === "error" ? "error-text" : "helper-text"}>{chunkSetSaveMessage}</p>
            ) : null}
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
