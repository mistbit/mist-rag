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
  sourceType: "txt" | "md" | "pdf";
  content: string;
  metadata: Record<string, string>;
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

