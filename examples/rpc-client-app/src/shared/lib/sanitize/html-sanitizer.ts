import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML string to prevent XSS attacks
 * @param html - Raw HTML string
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}
