/** Convert an arbitrary node name into a PascalCase component identifier. */
export function toPascalCase(name: string): string {
  const words = name
    .replace(/['’]/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const pascal = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  const safe = pascal.replace(/^[^a-zA-Z_]+/, '');
  return safe.length > 0 ? safe : 'Component';
}
