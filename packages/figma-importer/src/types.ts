import type { DocumentData } from '@openmake/shared';

export type FigmaImportSource =
  | { kind: 'fig-file'; path: string }
  | { kind: 'rest-api'; fileKey: string; token: string }
  | { kind: 'json-export'; data: unknown };

export type ImportIssueSeverity = 'info' | 'warning' | 'error';

export interface ImportIssue {
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  nodePath?: string;
}

export interface MigrationReport {
  imported: number;
  skipped: number;
  issues: ImportIssue[];
  fontsMissing: string[];
}

export interface ImportResult {
  document: DocumentData;
  report: MigrationReport;
}
