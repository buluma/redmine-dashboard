const TOC_MACRO_RE = /^\s*\{\{>?toc(?:\((?:[^()]|\([^)]*\))*\))?\}\}\s*$/gim;
const TEXTILE_HEADING_RE = /^(h([1-6])\.\s+)(.+)$/gm;
const TEXTILE_INLINE_LINK_RE = /"([^"\n]+)":(https?:\/\/[^\s<>"')\]]+)/g;
const TEXTILE_IMAGE_RE = /!(?:\{[^}]*\})?((?:(?:https?:\/\/|\/)[^\s!]+)|(?:[^!\n]+?\.(?:png|jpe?g|gif|webp|bmp|svg)))!/gi;
const REDMINE_IMAGE_REF_RE = /\[Image:\s*([^\]\n]+?\.(?:png|jpe?g|gif|webp|bmp|svg))\]/gi;
const TEXTILE_STYLED_SPAN_RE = /%\{[^}\n]*\}([^%\n]+)%/g;
const REDMINE_COLLAPSE_RE = /\{\{collapse(?:\(([^)]*)\))?\s*\n([\s\S]*?)\n\}\}/gi;
const REDMINE_COLLAPSE_INLINE_RE = /\{\{collapse(?:\(([^)]*)\))?\s*\|([\s\S]*?)\}\}/gi;
const REDMINE_COLLAPSE_IMAGE_RE = /\{\{collapse\(([^)]*)\)\s*!\{([^}]*)\}([^!\s]+)!\s*\}\}/gi;
const REDMINE_COLLAPSE_ANY_RE = /\{\{collapse(?:\(([^)]*)\))?\s*(?:\n([\s\S]*?)\n|\|([\s\S]*?))\}\}/gi;
const TEXTILE_CODE_RE = /(^|[^\w`])@([^\n@]+?)@(?=[^\w`]|$)/g;
const REDMINE_NOTEXTILE_RE = /<\/?notextile>/gim;
const REDMINE_PRE_CODE_RE = /<pre(?:\s+[^>]*)?>\s*<code(?:\s+class=["']?([^"'>\s]+)["']?)?>([\s\S]*?)<\/(?:code>\s*<\/pre>|pre>\s*<\/code>)/gim;
const REDMINE_ESCAPED_PRE_CODE_RE = /&lt;pre(?:\s+.*?)?&gt;\s*&lt;code(?:\s+class=(?:&quot;|["'])?([^"'>\s&]+)(?:&quot;|["'])?)?&gt;([\s\S]*?)&lt;\/(?:code&gt;\s*&lt;\/pre&gt;|pre&gt;\s*&lt;\/code&gt;)/gim;
const REDMINE_PRE_ONLY_RE = /<pre(?:\s+[^>]*)?>([\s\S]*?)<\/pre>/gim;
const REDMINE_ESCAPED_PRE_ONLY_RE = /&lt;pre(?:\s+.*?)?&gt;([\s\S]*?)&lt;\/pre&gt;/gim;
const SRC_ISSUE_REF_RE = /\[SRC\s+#(\d+)\s+from\s+([^\]\s]+)\]/gi;
const SRC_ISSUE_REF_SINGLE_RE = /\[SRC\s+#(\d+)\s+from\s+([^\]\s]+)\]/i;
const SRC_JOURNAL_REF_RE = /\[SRC-JOURNAL\s+#(\d+)\]/gi;
const URL_RE = /https?:\/\/[^\s<)\]]+/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function normalizeCodeLanguage(rawClass: string | undefined): string {
  if (!rawClass) return "";
  const lowered = rawClass.trim().toLowerCase();
  if (lowered.startsWith("language-")) {
    return lowered.slice("language-".length);
  }
  return lowered;
}

function asFence(code: string, rawClass: string | undefined, escaped = false): string {
  const language = normalizeCodeLanguage(rawClass);
  const source = escaped ? decodeHtmlEntities(code) : code;
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }
  return `\n\`\`\`${language}\n${trimmed}\n\`\`\`\n`;
}

function normalizeHostToBaseUrl(rawHost: string): string {
  const host = rawHost.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(host)) {
    return host;
  }
  return `https://${host}`;
}

function preferredJournalUrl(input: string, journalId: string, sourceUrl: string | null): string | null {
  const srcIssue = input.match(SRC_ISSUE_REF_SINGLE_RE);
  if (srcIssue?.[2]) {
    const base = normalizeHostToBaseUrl(srcIssue[2]);
    return `${base}/journals/${journalId}`;
  }
  if (sourceUrl) {
    return sourceUrl;
  }
  return null;
}

function convertSourceRefs(input: string): string {
  const sourceUrl = input.match(URL_RE)?.[0] ?? null;
  let out = input.replace(SRC_ISSUE_REF_RE, (_all, issueId: string, host: string) => {
    const base = normalizeHostToBaseUrl(host);
    return `[SRC #${issueId}](${base}/issues/${issueId})`;
  });
  out = out.replace(SRC_JOURNAL_REF_RE, (_all, journalId: string) => {
    const preferred = preferredJournalUrl(input, journalId, sourceUrl);
    if (!preferred) {
      return `[SRC-JOURNAL #${journalId}]`;
    }
    return `[SRC-JOURNAL #${journalId}](${preferred})`;
  });
  return out;
}

function toBlockQuote(content: string): string {
  return content
    .split("\n")
    .map((line) => (line.trim().length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

function normalizeCollapse(titleRaw: string | undefined, contentRaw: string): string {
  const title = (titleRaw ?? "Details").trim() || "Details";
  const content = contentRaw.trim();
  if (!content) {
    return `> **${title}**`;
  }
  return `> **${title}**\n>\n${toBlockQuote(content)}`;
}

function normalizeImageTarget(rawTarget: string): string {
  const target = rawTarget.trim();
  if (/^(?:https?:\/\/|\/)/i.test(target)) {
    return target;
  }
  return `/api/issues/_ATTACHMENT_/${encodeURI(target)}`;
}

function normalizeCollapseImage(title: string | undefined, _css: string | undefined, filename: string): string {
  const label = (title ?? "Image").trim() || "Image";
  const attachmentUrl = normalizeImageTarget(filename);
  return `\n> **${label}**\n\n![${filename}](${attachmentUrl})\n`;
}

function decodeEscapedWhitespace(input: string): string {
  return input
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\n")
    .replaceAll("\\t", "\t");
}

export type RedmineTextSegment =
  | { type: "markdown"; content: string }
  | { type: "collapse"; title: string; content: string };

export function splitRedmineCollapseSegments(input: string): RedmineTextSegment[] {
  const source = decodeEscapedWhitespace(input);
  const segments: RedmineTextSegment[] = [];
  let cursor = 0;

  REDMINE_COLLAPSE_ANY_RE.lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = REDMINE_COLLAPSE_ANY_RE.exec(source)) !== null) {
    const start = match.index;
    const end = REDMINE_COLLAPSE_ANY_RE.lastIndex;
    if (start > cursor) {
      const plain = source.slice(cursor, start);
      if (plain.trim().length > 0) {
        segments.push({ type: "markdown", content: plain });
      }
    }

    const title = (match[1] ?? "Details").trim() || "Details";
    const body = (match[2] ?? match[3] ?? "").trim();
    segments.push({ type: "collapse", title, content: body });
    cursor = end;
  }

  if (cursor < source.length) {
    const tail = source.slice(cursor);
    if (tail.trim().length > 0) {
      segments.push({ type: "markdown", content: tail });
    }
  }

  if (segments.length === 0) {
    return [{ type: "markdown", content: source }];
  }
  return segments;
}

export function normalizeRedmineText(input: string): string {
  let out = decodeEscapedWhitespace(input);
  out = convertSourceRefs(out);
  out = out.replace(REDMINE_IMAGE_REF_RE, (_all, target: string) => `![${target.trim()}](${normalizeImageTarget(target)})`);
  out = out.replace(REDMINE_ESCAPED_PRE_CODE_RE, (_all, cls: string | undefined, code: string) => asFence(code, cls, true));
  out = out.replace(REDMINE_PRE_CODE_RE, (_all, cls: string | undefined, code: string) => asFence(code, cls));
  out = out.replace(REDMINE_ESCAPED_PRE_ONLY_RE, (_all, code: string) => asFence(code, undefined, true));
  out = out.replace(REDMINE_PRE_ONLY_RE, (_all, code: string) => asFence(code, undefined));
  out = out.replace(REDMINE_NOTEXTILE_RE, "");
  out = out.replace(TOC_MACRO_RE, "");
  out = out.replace(REDMINE_COLLAPSE_IMAGE_RE, (_, title: string | undefined, css: string | undefined, filename: string) =>
    normalizeCollapseImage(title, css, filename),
  );
  out = out.replace(REDMINE_COLLAPSE_RE, (_, title: string | undefined, body: string) =>
    normalizeCollapse(title, body),
  );
  out = out.replace(REDMINE_COLLAPSE_INLINE_RE, (_, title: string | undefined, body: string) =>
    normalizeCollapse(title, body),
  );
  out = out.replace(TEXTILE_HEADING_RE, (_, __prefix: string, depth: string, title: string) => {
    const level = Number.parseInt(depth, 10);
    return `${"#".repeat(level)} ${title.trim()}`;
  });
  out = out.replace(TEXTILE_INLINE_LINK_RE, "[$1]($2)");
  out = out.replace(TEXTILE_IMAGE_RE, (_all, target: string) => `![](${normalizeImageTarget(target)})`);
  out = out.replace(TEXTILE_STYLED_SPAN_RE, "$1");
  out = out.replace(TEXTILE_CODE_RE, (_, prefix: string, code: string) => `${prefix}\`${code}\``);

  return out;
}
