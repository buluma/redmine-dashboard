/**
 * Sanitize user input to prevent XSS and injection attacks
 */

export function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim();
}

export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  // Allow safe HTML tags, remove dangerous ones
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

export function sanitizeSearchQuery(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  // Only allow safe characters for search
  return input
    .replace(/[^\w\s\-_@.]/g, "")
    .slice(0, 500) // Limit length
    .trim();
}

export function sanitizeFilename(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  // Remove path traversal and dangerous characters
  return input
    .replace(/\.\./g, "")
    .replace(/[^\w\-_.]/g, "_")
    .slice(0, 255);
}

export function sanitizeUrl(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  try {
    const url = new URL(input);
    // Only allow http/https
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}