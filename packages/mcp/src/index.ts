export { createOpenmakeMcpServer, type McpDeps } from './server.js';
export type {
  ComponentRecord,
  ComponentSearchResult,
  DocumentStore,
  GeneratedCodeRecord,
  IntelligenceAttachment,
  IntelligenceStore,
} from './types.js';
export { InMemoryDocumentStore, InMemoryIntelligenceStore } from './memory-stores.js';
export {
  summarizeDocument,
  readNodeToDepth,
  type DocumentSummary,
  type PageSummary,
  type NodeSummary,
  type NodeWithChildren,
} from './summaries.js';
