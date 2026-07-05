export type {
  FigmaImportSource,
  ImportIssue,
  ImportIssueSeverity,
  ImportResult,
  MigrationReport,
} from './types.js';
export { compatibilityMatrix, type CompatibilityStatus } from './compatibility.js';
export { parseFigmaRestDocument } from './importer.js';
