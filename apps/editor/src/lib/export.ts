export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  // Copy into a plain ArrayBuffer-backed view: some Uint8Array sources here
  // are typed as ArrayBufferLike (allows SharedArrayBuffer), which Blob's
  // BlobPart type doesn't accept.
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBytes(new TextEncoder().encode(text), filename, mime);
}
