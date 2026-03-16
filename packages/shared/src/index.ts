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
};

export type DocumentChunkSetSummary = {
  id: string;
  documentId: string;
  documentTitle: string;
  totalChunks: number;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: string;
};

export type DocumentChunkSetRecord = {
  id: string;
  documentId: string;
  documentTitle: string;
  createdAt: string;
  previewRequest: ChunkPreviewRequest;
  previewResponse: ChunkPreviewResponse;
};

export type DocumentChunkSetCatalogResponse = {
  sets: DocumentChunkSetSummary[];
};
