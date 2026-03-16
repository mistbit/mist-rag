export type FlowNode = {
  id: string;
  title: string;
  summary: string;
  learningFocus: string;
  output: string;
};

export type GlossaryItem = {
  term: string;
  description: string;
};

export type DeliveryMilestone = {
  name: string;
  goal: string;
  deliverables: string[];
};

export type RagOverview = {
  hero: {
    title: string;
    subtitle: string;
  };
  flow: FlowNode[];
  glossary: GlossaryItem[];
  sprintOne: DeliveryMilestone[];
};

export type DocumentRecord = {
  id: string;
  title: string;
  sourceType: DocumentSourceType;
  content: string;
  origin: DocumentOrigin;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, string>;
};

export type DocumentSourceType = "txt" | "md" | "pdf";
export type DocumentOrigin = "sample" | "saved";

export type DocumentSummary = {
  id: string;
  title: string;
  sourceType: Extract<DocumentSourceType, "txt" | "md">;
  origin: DocumentOrigin;
  excerpt: string;
  charCount: number;
  updatedAt: string;
};

export type DocumentCatalogResponse = {
  samples: DocumentSummary[];
  saved: DocumentSummary[];
};

export type SaveDocumentRequest = {
  title: string;
  sourceType: Extract<DocumentSourceType, "txt" | "md">;
  content: string;
};

export type ChunkRecord = {
  id: string;
  documentId: string;
  text: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
  metadata: Record<string, string>;
};

export type RetrievalResult = {
  chunkId: string;
  score: number;
  rank: number;
  text: string;
  documentId: string;
};

export type Citation = {
  answerSpan: string;
  chunkId: string;
  documentId: string;
};

export type RagRun = {
  id: string;
  query: string;
  retrieved: RetrievalResult[];
  prompt: string;
  answer: string;
  citations: Citation[];
  createdAt: string;
};

export type ChunkPreviewRequest = {
  title: string;
  sourceType: Extract<DocumentSourceType, "txt" | "md">;
  content: string;
  chunkSize: number;
  chunkOverlap: number;
};

export type ChunkPreviewDocument = {
  id: string;
  title: string;
  sourceType: Extract<DocumentSourceType, "txt" | "md">;
  charCount: number;
};

export type ChunkPreviewStats = {
  totalChunks: number;
  averageChunkLength: number;
  requestedChunkSize: number;
  requestedChunkOverlap: number;
};

export type ChunkPreviewResponse = {
  document: ChunkPreviewDocument;
  stats: ChunkPreviewStats;
  chunks: ChunkRecord[];
};

export type SaveChunkRunRequest = {
  title: string;
  documentId?: string | null;
  previewRequest: ChunkPreviewRequest;
};

export type ChunkRunSummary = {
  id: string;
  title: string;
  documentId?: string | null;
  totalChunks: number;
  chunkSize: number;
  chunkOverlap: number;
  charCount: number;
  createdAt: string;
};

export type ChunkRunRecord = {
  id: string;
  title: string;
  documentId?: string | null;
  createdAt: string;
  previewRequest: ChunkPreviewRequest;
  previewResponse: ChunkPreviewResponse;
};

export type ChunkRunCatalogResponse = {
  runs: ChunkRunSummary[];
};

export type SaveDocumentChunkSetRequest = {
  chunkSize: number;
  chunkOverlap: number;
  label?: string;
  notes?: string;
};

export type UpdateDocumentChunkSetRequest = {
  label: string;
  notes: string;
};

export type DocumentChunkSetSummary = {
  id: string;
  documentId: string;
  documentTitle: string;
  label: string;
  notes: string;
  totalChunks: number;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentChunkSetRecord = {
  id: string;
  documentId: string;
  documentTitle: string;
  label: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  previewRequest: ChunkPreviewRequest;
  previewResponse: ChunkPreviewResponse;
};

export type DocumentChunkSetCatalogResponse = {
  sets: DocumentChunkSetSummary[];
};

export type CreateIndexBuildRequest = {
  embeddingModel?: string;
  vectorDimensions?: number;
};

export type IndexBuildStatus = "ready";

export type ChunkVectorRecord = {
  chunkId: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
  values: number[];
};

export type IndexBuildSummary = {
  id: string;
  chunkSetId: string;
  documentId: string;
  documentTitle: string;
  chunkSetLabel: string;
  status: IndexBuildStatus;
  embeddingModel: string;
  vectorDimensions: number;
  totalVectors: number;
  vocabularySize: number;
  averageTokenCount: number;
  createdAt: string;
  updatedAt: string;
};

export type IndexBuildRecord = {
  id: string;
  chunkSetId: string;
  documentId: string;
  documentTitle: string;
  chunkSetLabel: string;
  status: IndexBuildStatus;
  embeddingModel: string;
  vectorDimensions: number;
  totalVectors: number;
  vocabularySize: number;
  averageTokenCount: number;
  createdAt: string;
  updatedAt: string;
  topTerms: string[];
  chunkVectors: ChunkVectorRecord[];
};

export type IndexBuildCatalogResponse = {
  builds: IndexBuildSummary[];
};

export type SearchIndexBuildRequest = {
  query: string;
  topK?: number;
  scoreThreshold?: number;
};

export type SearchResult = {
  chunkId: string;
  documentId: string;
  rank: number;
  score: number;
  text: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
};

export type SearchIndexBuildResponse = {
  buildId: string;
  chunkSetId: string;
  documentId: string;
  documentTitle: string;
  chunkSetLabel: string;
  embeddingModel: string;
  vectorDimensions: number;
  query: string;
  queryTerms: string[];
  topK: number;
  scoreThreshold: number;
  results: SearchResult[];
};

export type SaveRetrievalTraceRequest = SearchIndexBuildRequest;

export type RetrievalTraceSummary = {
  id: string;
  buildId: string;
  chunkSetId: string;
  documentId: string;
  documentTitle: string;
  query: string;
  topK: number;
  scoreThreshold: number;
  totalResults: number;
  createdAt: string;
};

export type RetrievalTraceRecord = {
  id: string;
  buildId: string;
  chunkSetId: string;
  documentId: string;
  documentTitle: string;
  createdAt: string;
  searchResponse: SearchIndexBuildResponse;
};

export type RetrievalTraceCatalogResponse = {
  traces: RetrievalTraceSummary[];
};

export type ComparisonSlotId = "A" | "B";

export type ComparisonSnapshotSearch = {
  query: string;
  topK: number;
  scoreThreshold: number;
  resultCount: number;
  topScore: number | null;
  queryTerms: string[];
  topResults: SearchResult[];
};

export type ComparisonSnapshot = {
  slotId: ComparisonSlotId;
  capturedAt: string;
  documentTitle: string;
  presetLabel: string;
  chunkSize: number;
  chunkOverlap: number;
  totalChunks: number;
  averageChunkLength: number;
  charCount: number;
  chunkSetLabel: string | null;
  embeddingModel: string | null;
  vectorDimensions: number | null;
  search: ComparisonSnapshotSearch | null;
};

export type ComparisonConclusionTone = "focus" | "steady" | "caution";

export type ComparisonConclusionCard = {
  label: string;
  title: string;
  body: string;
  tone: ComparisonConclusionTone;
};

export type SaveComparisonReportRequest = {
  title: string;
  slotA: ComparisonSnapshot;
  slotB: ComparisonSnapshot;
  conclusions: ComparisonConclusionCard[];
};

export type ComparisonReportSummary = {
  id: string;
  title: string;
  documentTitle: string;
  createdAt: string;
  hasSearchPair: boolean;
  chunkDelta: number;
  searchDelta: number | null;
  stableRankCount: number | null;
  comparedRankCount: number | null;
  leadConclusion: string;
};

export type ComparisonReportRecord = {
  id: string;
  title: string;
  documentTitle: string;
  createdAt: string;
  slotA: ComparisonSnapshot;
  slotB: ComparisonSnapshot;
  conclusions: ComparisonConclusionCard[];
};

export type ComparisonReportCatalogResponse = {
  reports: ComparisonReportSummary[];
};
