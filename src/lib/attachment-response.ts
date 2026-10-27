const INLINE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function attachmentResponseHeaders(filename: string, contentType: string): Headers {
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  const disposition = INLINE_CONTENT_TYPES.has(mime) ? "inline" : "attachment";
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_").slice(0, 150) || "attachment";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const headers = new Headers({
    "content-type": contentType,
    "content-disposition": `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
  });
  return headers;
}
