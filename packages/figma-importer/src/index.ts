export type {
  FigmaImportSource,
  ImportIssue,
  ImportIssueSeverity,
  ImportResult,
  MigrationReport,
} from './types.js';
export { compatibilityMatrix, type CompatibilityStatus } from './compatibility.js';
export { parseFigmaRestDocument } from './importer.js';
export {
  parseFigFile,
  MAX_DECOMPRESSED_BYTES,
  MAX_NODE_CHANGES,
  type ContainerErrorCode,
  type FigContainer,
  type FigMessage,
  type FigNodeChange,
} from './fig/index.js';
