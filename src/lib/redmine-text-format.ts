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
const STEPS_LABEL_RE = /^(\s*.*?\bsteps?\s+to\s+reproduce\b\s*:?\s*)(.+)$/i;
const COLLAPSE_TOGGLE_TITLE_RE = /^(show\s*,\s*hide|hide\s*,\s*show)$/i;

const TEMPLATE_SECTION_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /^\*?\s*Reason Dev\s*:?\s*\*?\s*(.*)$/i, label: "Reason Dev" },
  { regex: /^\*?\s*Reason QA\s*:?\s*\*?\s*(.*)$/i, label: "Reason QA" },
  { regex: /^\*?\s*If Blocker\s*:?\s*\*?\s*(.*)$/i, label: "If Blocker" },
  { regex: /^\*?\s*What's wrong\?\s*\(description\)\s*:?\s*\*?\s*(.*)$/i, label: "What's wrong? (description)" },
  { regex: /^\*?\s*Steps to reproduce\s*:?\s*\*?\s*(.*)$/i, label: "Steps to reproduce" },
  { regex: /^\*?\s*Result\s*:?\s*\*?\s*(.*)$/i, label: "Result" },
  { regex: /^\*?\s*Expected\s*:?\s*\*?\s*(.*)$/i, label: "Expected" },
  { regex: /^\*?\s*Requirements\s*\(Design\)\s*URL\s*:?\s*\*?\s*(.*)$/i, label: "Requirements (Design) URL" },
  { regex: /^\*?\s*Repetition of bug\*?\s*(?:\([^)]*\))?\s*:?\s*(.*)$/i, label: "Repetition of bug" },
  { regex: /^\*?\s*DB\s*:?\s*\*?\s*(.*)$/i, label: "DB" },
  { regex: /^\*?\s*MC version\s*:?\s*\*?\s*(.*)$/i, label: "MC version" },
  { regex: /^\*?\s*Update\s*:?\s*\*?\s*(.*)$/i, label: "Update" },
  { regex: /^\*?\s*Notes\s*:?\s*\*?\s*(.*)$/i, label: "Notes" },
  { regex: /^\*?\s*Link to Draft\s*:?\s*\*?\s*(.*)$/i, label: "Link to Draft" },
  { regex: /^\*?\s*Link to CL\s*:?\s*\*?\s*(.*)$/i, label: "Link to CL" },
  { regex: /^\*?\s*Link to code style\s*:?\s*\*?\s*(.*)$/i, label: "Link to code style" },
  { regex: /^\*?\s*Link to design rules\s*:?\s*\*?\s*(.*)$/i, label: "Link to design rules" },
  { regex: /^\*?\s*CO checklist(?:\s*\(.*\))?\s*:?\s*\*?\s*(.*)$/i, label: "CO checklist" },
];

function detectTemplateMode(input: string): "bug" | "generic" | null {
  const hasChecklist = /\bCO checklist\b/i.test(input);
  const hasBugAnchors = /\bReason Dev\b/i.test(input) && /\bSteps to reproduce\b/i.test(input);
  const hasGenericAnchors = /\bLink to Draft\b/i.test(input) && /\bLink to CL\b/i.test(input);
  if (hasBugAnchors && hasChecklist) return "bug";
  if (hasGenericAnchors && hasChecklist) return "generic";
  return null;
}

function normalizeCollapseTitle(rawTitle: string | undefined): string {
  const title = (rawTitle ?? "Details").trim();
  if (!title || COLLAPSE_TOGGLE_TITLE_RE.test(title)) {
    return "Details";
  }
  return title;
}

function formatInlineNumberedSequence(input: string): string | null {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!/^\d+[\.\)]?\s+/.test(normalized)) {
    return null;
  }
  const segments = normalized.match(/\d+[\.\)]?\s+[\s\S]*?(?=(?:\s+\d+[\.\)]?\s+\S|$))/g);
  if (!segments || segments.length < 2) {
    return null;
  }
  return segments
    .map((segment) => segment.trim().replace(/^(\d+)[\.\)]?\s+/, "$1. "))
    .join("\n");
}

function normalizeInlineNumberedSteps(input: string): string {
  const lines = input.split("\n");
  return lines
    .map((line) => {
      const labelMatch = line.match(STEPS_LABEL_RE);
      if (labelMatch) {
        const formatted = formatInlineNumberedSequence(labelMatch[2]);
        if (formatted) {
          return `${labelMatch[1].trimEnd()}\n${formatted}`;
        }
      }

      const trimmed = line.trim();
      const formatted = formatInlineNumberedSequence(trimmed);
      if (!formatted) {
        return line;
      }

      const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
      return formatted
        .split("\n")
        .map((entry) => `${leadingWhitespace}${entry}`)
        .join("\n");
    })
    .join("\n");
}

function normalizeBulletLine(line: string): string {
  if (/^\s*[•·]\s*$/.test(line)) {
    return "- ";
  }
  return line.replace(/^(\s*)[•·]\s*/, "$1- ");
}

function normalizeTemplateSections(input: string): string {
  const mode = detectTemplateMode(input);
  let out = normalizeInlineNumberedSteps(input);
  if (!mode) {
    return out
      .split("\n")
      .map((line) => normalizeBulletLine(line))
      .join("\n");
  }

  const lines = out.split("\n");
  const normalized: string[] = [];
  let inStepsSection = false;

  for (const line of lines) {
    const bulletNormalized = normalizeBulletLine(line);
    const trimmed = bulletNormalized.trim();
    let matchedSection: { label: string; body: string } | null = null;

    for (const { regex, label } of TEMPLATE_SECTION_PATTERNS) {
      const match = trimmed.match(regex);
      if (!match) continue;
      matchedSection = { label, body: (match[1] ?? "").trim() };
      break;
    }

    if (matchedSection) {
      if (normalized.length > 0 && normalized[normalized.length - 1].trim().length > 0) {
        normalized.push("");
      }
      normalized.push(`**${matchedSection.label}:**${matchedSection.body ? ` ${matchedSection.body}` : ""}`);
      inStepsSection = matchedSection.label.toLowerCase() === "steps to reproduce";
      continue;
    }

    if (inStepsSection) {
      const stepMatch = trimmed.match(/^(\d+)[\.\)]?\s*(.*)$/);
      if (stepMatch) {
        const [, step, body] = stepMatch;
        normalized.push(`${step}. ${body.trim()}`.trimEnd());
        continue;
      }
      if (trimmed.length === 0) {
        normalized.push("");
        continue;
      }
      if (/^\{\{collapse/i.test(trimmed)) {
        inStepsSection = false;
      } else if (!/^- /.test(trimmed)) {
        inStepsSection = false;
      }
    }

    normalized.push(bulletNormalized);
  }

  out = normalized.join("\n");
  return out;
}

function applyOutsideCodeFences(input: string, transform: (segment: string) => string): string {
  const segments = input.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment, index) => (index % 2 === 1 ? segment : transform(segment)))
    .join("");
}

function splitTextileTableRow(trimmedLine: string): string[] {
  return trimmedLine
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function stripTextileCellPrefix(cell: string): string {
  return cell
    .replace(/^((?:[_<>^=~]|\\\d+|\/\d+|\{[^}]+\})+)\.\s*/, "")
    .replace(/^\.\s*/, "");
}

function convertTextileTableBlock(lines: string[]): string[] {
  if (lines.length === 0) return lines;

  const parsedRows = lines.map((line) => splitTextileTableRow(line.trim()).map(stripTextileCellPrefix));
  const maxCols = Math.max(...parsedRows.map((row) => row.length));
  if (maxCols <= 0) return lines;

  const normalizedRows = parsedRows.map((row) => [
    ...row,
    ...new Array(Math.max(0, maxCols - row.length)).fill(""),
  ]);

  const toMarkdownRow = (row: string[]) => `| ${row.join(" | ")} |`;
  const header = toMarkdownRow(normalizedRows[0]);
  const separator = `| ${new Array(maxCols).fill("---").join(" | ")} |`;
  const body = normalizedRows.slice(1).map(toMarkdownRow);

  return [header, separator, ...body];
}

function convertTextileTables(input: string): string {
  const lines = input.split("\n");
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const isTextileTableLine = trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;

    if (!isTextileTableLine) {
      out.push(line);
      index += 1;
      continue;
    }

    const block: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const candidate = lines[cursor].trim();
      const candidateIsTable = candidate.startsWith("|") && candidate.endsWith("|") && candidate.length > 2;
      if (!candidateIsTable) break;
      block.push(lines[cursor]);
      cursor += 1;
    }

    if (block.length >= 2) {
      out.push(...convertTextileTableBlock(block));
    } else {
      out.push(...block);
    }
    index = cursor;
  }

  return out.join("\n");
}

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
  const title = normalizeCollapseTitle(titleRaw);
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

    const title = normalizeCollapseTitle(match[1]);
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
  out = convertTextileTables(out);
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
  out = applyOutsideCodeFences(out, (segment) => normalizeTemplateSections(segment));

  return out;
}
