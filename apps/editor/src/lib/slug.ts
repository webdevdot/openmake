/**
 * Kebab-case a file name for the cosmetic `/file/:fileId/:slug` URL segment
 * (mirrors Figma's `/design/:key/:slug`). Lowercases, collapses any run of
 * non-alphanumeric characters to a single hyphen, and trims leading/trailing
 * hyphens. An empty or all-symbol name yields `'untitled'` so the segment is
 * always a valid, non-empty path piece.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}
