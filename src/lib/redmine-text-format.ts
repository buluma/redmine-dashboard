const TOC_MACRO_RE = /^\s*\{\{>?toc(?:\((?:[^()]|\([^)]*\))*\))?\}\}\s*$/gim;
const TEXTILE_HEADING_RE = /^(h([1-6])\.\s+)(.+)$/gm;
const TEXTILE_INLINE_LINK_RE = /"([^"\n]+)":(https?:\/\/[^\s<>"')\]]+)/g;
const TEXTILE_IMAGE_RE = /!((?:https?:\/\/|\/)[^\s!]+)!/g;
const REDMINE_COLLAPSE_RE = /\{\{collapse(?:\(([^)]*)\))?\s*\n([\s\S]*?)\n\}\}/g;
const REDMINE_COLLAPSE_INLINE_RE = /\{\{collapse(?:\(([^)]*)\))?\s*\|([\s\S]*?)\}\}/g;
const TEXTILE_CODE_RE = /(^|[^\w`])@([^\n@]+?)@(?=[^\w`]|$)/g;
const REDMINE_NOTEXTILE_RE = /<\/?notextile>/gim;

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
  let out = input;
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
