import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { RedmineClient } from "@/src/lib/redmine";

const execFileAsync = promisify(execFile);

const MAX_ATTACHMENTS_TO_EXTRACT = 5;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_CHARS = 12000;
const MAX_SINGLE_EXTRACTED_CHARS = 3500;

const TEXT_CONTENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/csv",
  "application/javascript",
  "application/x-javascript",
  "application/sql",
  "application/x-sh",
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".log",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".yml",
  ".yaml",
  ".sql",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rb",
  ".java",
  ".go",
  ".sh",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
  ".html",
  ".htm",
]);

export interface AttachmentForAiExtraction {
  redmineAttachmentId: number;
  filename: string;
  filesize: number;
  contentType?: string | null;
  downloadUrl: string;
}

type AttachmentKind = "text" | "pdf" | "unsupported";

function classifyAttachment(contentType: string | null | undefined, filename: string): AttachmentKind {
  const normalizedType = (contentType ?? "").toLowerCase().trim();
  if (normalizedType === "application/pdf") return "pdf";
  if (normalizedType.startsWith("text/")) return "text";
  if (TEXT_CONTENT_TYPES.has(normalizedType)) return "text";

  const extension = path.extname(filename).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (TEXT_EXTENSIONS.has(extension)) return "text";

  return "unsupported";
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  if (sample.length === 0) return false;
  let controlCount = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) {
      controlCount += 1;
    }
  }
  return controlCount / sample.length > 0.2;
}

function extractTextFromBuffer(buffer: Buffer): string {
  if (looksBinary(buffer)) return "";
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return normalizeExtractedText(decoder.decode(buffer));
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "rd-attachment-ai-"));
  const inputPath = path.join(tempDir, "input.pdf");
  try {
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-q", inputPath, "-"], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return normalizeExtractedText(stdout);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return "";
    }
    return "";
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
}

export async function extractAttachmentSnippetsForAi(
  client: RedmineClient | null,
  attachments: AttachmentForAiExtraction[]
): Promise<Map<number, string>> {
  const snippets = new Map<number, string>();
  if (!client || attachments.length === 0) {
    return snippets;
  }

  const candidates = attachments
    .filter((attachment) => attachment.filesize > 0 && attachment.filesize <= MAX_ATTACHMENT_BYTES)
    .filter((attachment) => classifyAttachment(attachment.contentType, attachment.filename) !== "unsupported")
    .slice(0, MAX_ATTACHMENTS_TO_EXTRACT);

  let totalChars = 0;

  for (const attachment of candidates) {
    if (totalChars >= MAX_TOTAL_EXTRACTED_CHARS) {
      break;
    }

    try {
      const response = await client.downloadAttachment(attachment.downloadUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const headerType = response.headers.get("content-type");
      const kind = classifyAttachment(headerType ?? attachment.contentType, attachment.filename);
      if (kind === "unsupported") {
        continue;
      }

      let extractedText = "";
      if (kind === "text") {
        extractedText = extractTextFromBuffer(buffer);
      } else if (kind === "pdf") {
        extractedText = await extractTextFromPdfBuffer(buffer);
      }

      if (!extractedText) {
        continue;
      }

      const remaining = Math.max(0, MAX_TOTAL_EXTRACTED_CHARS - totalChars);
      const capped = truncate(extractedText, Math.min(MAX_SINGLE_EXTRACTED_CHARS, remaining));
      if (!capped) {
        continue;
      }

      snippets.set(attachment.redmineAttachmentId, capped);
      totalChars += capped.length;
    } catch {
      // Best-effort enrichment; do not fail summarization when one attachment cannot be read.
      continue;
    }
  }

  return snippets;
}
