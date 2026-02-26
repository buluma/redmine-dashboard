const TOC_MACRO_RE = /^\s*\{\{>?toc(?:\((?:[^()]|\([^)]*\))*\))?\}\}\s*$/gim;
const TEXTILE_HEADING_RE = /^(h([1-6])\.\s+)(.+)$/gm;
const TEXTILE_INLINE_LINK_RE = /"([^"\n]+)":(https?:\/\/[^\s<>"')\]]+)/g;
const TEXTILE_IMAGE_RE = /!((?:https?:\/\/|\/)[^\s!]+)!/g;
const REDMINE_COLLAPSE_RE = /\{\{collapse(?:\(([^)]*)\))?\s*\n([\s\S]*?)\n\}\}/g;
const REDMINE_COLLAPSE_INLINE_RE = /\{\{collapse(?:\(([^)]*)\))?\s*\|([\s\S]*?)\}\}/g;
const TEXTILE_CODE_RE = /(^|[^\w`])@([^\n@]+?)@(?=[^\w`]|$)/g;
const REDMINE_NOTEXTILE_RE = /<\/?notextile>/gim;
const REDMINE_PRE_CODE_RE = /<pre>\s*<code(?:\s+class=["']?([^"'>\s]+)["']?)?>([\s\S]*?)<\/(?:code>\s*<\/pre>|pre>\s*<\/code>)/gim;
const REDMINE_ESCAPED_PRE_CODE_RE = /&lt;pre&gt;\s*&lt;code(?:\s+class=(?:&quot;|["'])?([^"'>\s&]+)(?:&quot;|["'])?)?&gt;([\s\S]*?)&lt;\/(?:code&gt;\s*&lt;\/pre&gt;|pre&gt;\s*&lt;\/code&gt;)/gim;
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

export function normalizeRedmineText(input: string): string {
  let out = convertSourceRefs(input);
  out = out.replace(REDMINE_ESCAPED_PRE_CODE_RE, (_all, cls: string | undefined, code: string) => asFence(code, cls, true));
  out = out.replace(REDMINE_PRE_CODE_RE, (_all, cls: string | undefined, code: string) => asFence(code, cls));
  out = out.replace(REDMINE_NOTEXTILE_RE, "");
  out = out.replace(TOC_MACRO_RE, "");
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
  out = out.replace(TEXTILE_IMAGE_RE, "![]($1)");
  out = out.replace(TEXTILE_CODE_RE, (_, prefix: string, code: string) => `${prefix}\`${code}\``);

  return out;
}
