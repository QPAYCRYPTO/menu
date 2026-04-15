import sanitizeHtml from 'sanitize-html';

export function sanitizeText(value: string): string {
  const sanitized = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();

  // HTML entity'leri geri decode et
  return sanitized
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}