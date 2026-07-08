import type { ImportIssue, ImportResult } from '../types.js';
import { parseFigContainer } from './container.js';
import { decodeFigMessage } from './kiwi.js';
import { emptyImportResult, mapFigMessage } from './mapper.js';

export { MAX_DECOMPRESSED_BYTES, type ContainerErrorCode, type FigContainer } from './container.js';
export { MAX_NODE_CHANGES } from './mapper.js';
export type { FigMessage, FigNodeChange } from './kiwi.js';

/**
 * EXPERIMENTAL: parse a downloaded `.fig` binary file (Figma's undocumented
 * internal format) into an openmake document.
 *
 * Guarantees:
 * - NEVER throws: every failure path returns a valid (possibly empty)
 *   DocumentData plus error/warning issues in the report.
 * - Browser-safe: no Node built-ins, decompressed output and node counts are
 *   capped so hostile files cannot OOM the tab.
 */
export function parseFigFile(bytes: Uint8Array): ImportResult {
  const issues: ImportIssue[] = [];
  try {
    const containerResult = parseFigContainer(bytes);
    if (!containerResult.ok) {
      issues.push({
        severity: 'error',
        code: containerResult.code,
        message: containerResult.message,
      });
      return emptyImportResult(issues);
    }

    const { version, schemaBytes, dataBytes } = containerResult.container;
    issues.push({
      severity: 'info',
      code: 'fig-version',
      message: `Figma .fig payload version ${version}.`,
    });

    const decoded = decodeFigMessage(schemaBytes, dataBytes);
    if (!decoded.ok) {
      issues.push({ severity: 'error', code: decoded.code, message: decoded.message });
      return emptyImportResult(issues);
    }

    const result = mapFigMessage(decoded.message);
    result.report.issues.unshift(...issues);
    return result;
  } catch (err) {
    // Last-resort guard: this parser handles hostile input and must never
    // throw; anything reaching here is a bug, surfaced as an issue instead.
    issues.push({
      severity: 'error',
      code: 'internal-error',
      message: `Unexpected importer failure: ${err instanceof Error ? err.message : String(err)}`,
    });
    return emptyImportResult(issues);
  }
}
