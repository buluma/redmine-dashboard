import type { OllamaChatMessage } from "./ollama";

export interface IssueContext {
  id: string;
  redmineIssueId: number | null;
  subject: string;
  description?: string | null;
  projectName?: string | null;
  tracker?: string | null;
  priority?: string | null;
  statusId: number;
  statusName: string;
  assignedToName?: string | null;
  dueDate?: string | null;
  doneRatio?: number | null;
  updatedOn: string;
  journals?: Array<{
    author?: string | null;
    notes?: string | null;
    createdOn?: string | null;
  }>;
  timeEntries?: Array<{
    hours: number;
    activityName?: string | null;
    authorName?: string | null;
    comments?: string | null;
    spentOn?: string | null;
  }>;
  attachments?: Array<{
    redmineAttachmentId?: number;
    filename: string;
    contentType?: string | null;
    filesize?: number | null;
    createdOn?: string | null;
    extractedText?: string | null;
  }>;
}

function truncateText(input: string, maxLength: number): string {
  const cleaned = input.trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}...`;
}

function asCompactLine(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringList(value: unknown, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : ""))
    .map((item) => asCompactLine(item))
    .filter((item) => item.length > 0)
    .slice(0, maxItems)
    .map((item) => truncateText(item, maxItemLength));
}

function topHours(
  entries: Array<{ name: string; hours: number }>,
  limit: number
): Array<{ name: string; hours: number }> {
  return entries
    .filter((entry) => entry.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, limit)
    .map((entry) => ({ name: entry.name, hours: Number(entry.hours.toFixed(2)) }));
}

function summarizeTime(entries: IssueContext["timeEntries"]): {
  totalHours: number;
  entryCount: number;
  byActivity: Array<{ name: string; hours: number }>;
  byAuthor: Array<{ name: string; hours: number }>;
} {
  const source = entries ?? [];
  const byActivity = new Map<string, number>();
  const byAuthor = new Map<string, number>();
  let totalHours = 0;

  for (const entry of source) {
    const hours = Math.max(0, toNumber(entry.hours, 0));
    totalHours += hours;
    const activity = asCompactLine(entry.activityName ?? "") || "Unspecified";
    const author = asCompactLine(entry.authorName ?? "") || "Unknown";
    byActivity.set(activity, (byActivity.get(activity) ?? 0) + hours);
    byAuthor.set(author, (byAuthor.get(author) ?? 0) + hours);
  }

  return {
    totalHours: Number(totalHours.toFixed(2)),
    entryCount: source.length,
    byActivity: topHours(
      Array.from(byActivity.entries()).map(([name, hours]) => ({ name, hours })),
      5
    ),
    byAuthor: topHours(
      Array.from(byAuthor.entries()).map(([name, hours]) => ({ name, hours })),
      5
    ),
  };
}

export function formatIssueForPrompt(issue: IssueContext): string {
  const parts = [
    `Issue #${issue.redmineIssueId}: ${issue.subject}`,
    `Status: ${issue.statusName} (${issue.doneRatio ?? 0}% complete)`,
    issue.tracker ? `Type: ${issue.tracker}` : null,
    issue.priority ? `Priority: ${issue.priority}` : null,
    issue.projectName ? `Project: ${issue.projectName}` : null,
    issue.assignedToName ? `Assigned to: ${issue.assignedToName}` : null,
    issue.dueDate ? `Due: ${issue.dueDate}` : null,
    issue.updatedOn ? `Last updated: ${issue.updatedOn}` : null,
    issue.description ? `\nDescription:\n${truncateText(issue.description, 6000)}` : null,
  ].filter(Boolean);

  const journals = issue.journals ?? [];
  if (journals.length > 0) {
    const journalLines = journals.slice(0, 25).map((journal) => {
      const created = journal.createdOn ? new Date(journal.createdOn).toISOString() : "unknown-date";
      const author = asCompactLine(journal.author ?? "") || "Unknown";
      const notes = truncateText(asCompactLine(journal.notes ?? "") || "(no note text)", 260);
      return `- [${created}] ${author}: ${notes}`;
    });
    parts.push(`\nRecent journals (${journals.length}):\n${journalLines.join("\n")}`);
  }

  const timeEntries = issue.timeEntries ?? [];
  if (timeEntries.length > 0) {
    const timeSummary = summarizeTime(timeEntries);
    const timeLines = timeEntries.slice(0, 20).map((entry) => {
      const spentOn = entry.spentOn ? new Date(entry.spentOn).toISOString().slice(0, 10) : "unknown-date";
      const author = asCompactLine(entry.authorName ?? "") || "Unknown";
      const activity = asCompactLine(entry.activityName ?? "") || "Unspecified";
      const comments = truncateText(asCompactLine(entry.comments ?? ""), 160);
      const commentsPart = comments ? ` | ${comments}` : "";
      return `- [${spentOn}] ${author} | ${activity} | ${Number(entry.hours).toFixed(2)}h${commentsPart}`;
    });

    const byActivityText = timeSummary.byActivity.map((item) => `${item.name}: ${item.hours.toFixed(2)}h`).join("; ");
    const byAuthorText = timeSummary.byAuthor.map((item) => `${item.name}: ${item.hours.toFixed(2)}h`).join("; ");
    parts.push(
      `\nTime spent:\nTotal: ${timeSummary.totalHours.toFixed(2)}h across ${timeSummary.entryCount} entries\nBy activity: ${byActivityText || "none"}\nBy contributor: ${byAuthorText || "none"}\nRecent entries:\n${timeLines.join("\n")}`
    );
  }

  const attachments = issue.attachments ?? [];
  if (attachments.length > 0) {
    const attachmentLines = attachments.slice(0, 20).map((attachment) => {
      const type = asCompactLine(attachment.contentType ?? "") || "unknown-type";
      const sizeKb = Math.max(0, Math.round((attachment.filesize ?? 0) / 1024));
      const created = attachment.createdOn ? new Date(attachment.createdOn).toISOString().slice(0, 10) : "unknown-date";
      const excerpt = attachment.extractedText
        ? truncateText(asCompactLine(attachment.extractedText), 700)
        : "";
      const excerptLine = excerpt ? `\n  Extracted excerpt: ${excerpt}` : "";
      return `- ${attachment.filename} (${type}, ${sizeKb} KB, uploaded ${created})${excerptLine}`;
    });
    parts.push(`\nAttachments (${attachments.length}):\n${attachmentLines.join("\n")}`);
  }

  return parts.join("\n");
}

export const SYSTEM_PROMPTS = {
  summarize: `You are an expert project manager assistant helping to summarize Redmine issues. Build a structured, factual status summary based only on the provided issue context (description, journals, timelogs, and attachment details/excerpts when available).

Respond ONLY with valid JSON in this exact format (no markdown, no prose outside JSON):
{
  "summary": "A 2-3 sentence summary of the issue",
  "keyPoints": ["3-6 concrete facts from description/journals/timelogs"],
  "actionItems": ["3-6 actionable next steps"],
  "risks": ["0-5 specific risks or blockers"],
  "openQuestions": ["0-5 clarifications needed"],
  "timeline": [
    { "at": "ISO date/time or date", "author": "name", "type": "journal|time|status|other", "detail": "event detail" }
  ],
  "timeSpent": {
    "totalHours": 0,
    "entryCount": 0,
    "byActivity": [{ "name": "activity", "hours": 0 }],
    "byAuthor": [{ "name": "person", "hours": 0 }]
  },
  "attachments": [
    { "filename": "name.ext", "type": "mime/type", "sizeKb": 0, "note": "relevance in one sentence" }
  ],
  "confidence": 0.0-1.0 confidence score
}

Rules:
- Do not invent facts not present in input.
- Keep all arrays concise and relevant.
- If a section has no data, return an empty array or zero values.
- Keep summary and action items precise and operational.`,

  categorize: `You are an expert project manager assistant helping to categorize and prioritize Redmine issues. Based on the issue details, suggest appropriate categories, tags, and priority adjustments.

Respond ONLY with valid JSON in this exact format:
{
  "suggestedPriority": {
    "name": "Priority name (Low/Normal/High/Urgent)",
    "confidence": 0.0-1.0
  },
  "suggestedTags": [
    { "name": "tag1", "confidence": 0.0-1.0 },
    { "name": "tag2", "confidence": 0.0-1.0 }
  ],
  "suggestedCategory": {
    "name": "Category name",
    "confidence": 0.0-1.0
  },
  "reasoning": "Brief explanation of your categorization choices"
}

Consider: urgency, impact, effort, deadlines, and dependencies when categorizing.`,

  search: `You are an expert search assistant helping to find relevant Redmine issues. Based on the search query and available issues, explain why each issue is relevant and rank them by relevance.

Respond ONLY with valid JSON in this exact format:
{
  "results": [
    {
      "issueId": "internal issue ID",
      "relevance": 0.0-1.0,
      "explanation": "Why this issue matches the search"
    }
  ],
  "insights": "Any additional insights about the search results",
  "modelUsed": "The model used for this search"
}

Be specific about why each result matches the query.`,

  chat: `You are a helpful project management assistant integrated into Converge, a dashboard that tracks two kinds of tickets: Redmine issues (referenced as #4521) and local/personal tickets (referenced as L-5). You help users understand their issues, suggest improvements, and answer questions about their project work.

Tools accept either reference form for issue_id — pass "L-5" for personal tickets and the numeric ID for Redmine issues. Use search_issues to find a ticket's reference when the user names it by subject. Use get_time_summary for questions about tracked hours or what the user worked on.

Keep responses concise and actionable. When helpful, reference specific tickets by their #ID or L-N reference. Be friendly but professional.`,
};

export function createSummarizeMessages(issue: IssueContext): OllamaChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPTS.summarize },
    {
      role: "user",
      content: `Please summarize the following issue:\n\n${formatIssueForPrompt(issue)}`,
    },
  ];
}

export function createCategorizeMessages(issue: IssueContext): OllamaChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPTS.categorize },
    {
      role: "user",
      content: `Please categorize the following issue:\n\n${formatIssueForPrompt(issue)}`,
    },
  ];
}

export function createSearchMessages(
  query: string,
  issues: IssueContext[]
): OllamaChatMessage[] {
  const issuesList = issues.map(formatIssueForPrompt).join("\n\n---\n\n");

  return [
    { role: "system", content: SYSTEM_PROMPTS.search },
    {
      role: "user",
      content: `Search query: "${query}"\n\nAvailable issues:\n\n${issuesList}\n\nRank these issues by relevance to the search query.`,
    },
  ];
}

export function createChatMessages(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  context?: { recentIssues?: IssueContext[] }
): OllamaChatMessage[] {
  const messages: OllamaChatMessage[] = [{ role: "system", content: SYSTEM_PROMPTS.chat }];

  // Add context if provided
  if (context?.recentIssues && context.recentIssues.length > 0) {
    const contextIntro: OllamaChatMessage = {
      role: "system",
      content:
        "Here are the user's recent issues for context:\n\n" +
        context.recentIssues
          .slice(0, 5)
          .map(formatIssueForPrompt)
          .join("\n\n---\n\n"),
    };
    messages.push(contextIntro);
  }

  // Add conversation history
  for (const msg of conversation) {
    messages.push({ role: msg.role, content: msg.content });
  }

  return messages;
}

export function parseJsonResponse<T>(content: string): T | null {
  // Try to extract JSON from the content
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

export interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  risks: string[];
  openQuestions: string[];
  timeline: Array<{
    at: string;
    author: string;
    type: "journal" | "time" | "status" | "other";
    detail: string;
  }>;
  timeSpent: {
    totalHours: number;
    entryCount: number;
    byActivity: Array<{ name: string; hours: number }>;
    byAuthor: Array<{ name: string; hours: number }>;
  };
  attachments: Array<{
    filename: string;
    type: string;
    sizeKb: number;
    note: string;
  }>;
  confidence: number;
}

export interface CategorizeResponse {
  suggestedPriority: { name: string; confidence: number };
  suggestedTags: Array<{ name: string; confidence: number }>;
  suggestedCategory: { name: string; confidence: number };
  reasoning: string;
}

export interface SearchResult {
  issueId: string;
  relevance: number;
  explanation: string;
}

export interface SearchResponse {
  results: SearchResult[];
  insights: string;
  modelUsed: string;
}

function fallbackSummary(issue: IssueContext): SummarizeResponse {
  const description = asCompactLine(issue.description ?? "");
  const shortDescription = description ? truncateText(description, 220) : "No detailed description provided.";
  const timeSpent = summarizeTime(issue.timeEntries ?? []);

  return {
    summary: `Issue #${issue.redmineIssueId} is currently ${issue.statusName} (${issue.doneRatio ?? 0}% complete). ${shortDescription}`,
    keyPoints: [
      issue.priority ? `Priority: ${issue.priority}` : "Priority: not set",
      issue.assignedToName ? `Assigned to ${issue.assignedToName}` : "No assignee is set",
      issue.dueDate ? `Due date: ${issue.dueDate}` : "No due date is set",
      `Journals captured: ${(issue.journals ?? []).length}`,
      `Time entries captured: ${timeSpent.entryCount} (${timeSpent.totalHours.toFixed(2)}h total)`,
    ],
    actionItems: [
      "Confirm the current blocker/root cause from the latest journal notes.",
      "Align owner and due date with the next delivery milestone.",
      "Verify acceptance criteria and close open clarifications before status transition.",
    ],
    risks: [],
    openQuestions: [],
    timeline: [],
    timeSpent,
    attachments: (issue.attachments ?? []).slice(0, 10).map((attachment) => ({
      filename: attachment.filename,
      type: asCompactLine(attachment.contentType ?? "") || "unknown-type",
      sizeKb: Math.max(0, Math.round((attachment.filesize ?? 0) / 1024)),
      note: "",
    })),
    confidence: 0.35,
  };
}

function normalizeTimeline(value: unknown): SummarizeResponse["timeline"] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const typeRaw = typeof record.type === "string" ? record.type.toLowerCase() : "other";
      const type: "journal" | "time" | "status" | "other" =
        typeRaw === "journal" || typeRaw === "time" || typeRaw === "status" ? typeRaw : "other";
      return {
        at: truncateText(asCompactLine(typeof record.at === "string" ? record.at : ""), 60),
        author: truncateText(asCompactLine(typeof record.author === "string" ? record.author : ""), 60),
        type,
        detail: truncateText(asCompactLine(typeof record.detail === "string" ? record.detail : ""), 220),
      };
    })
    .filter((entry) => entry.at || entry.detail);
}

function normalizeHoursList(value: unknown): Array<{ name: string; hours: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        name: truncateText(asCompactLine(typeof record.name === "string" ? record.name : ""), 80),
        hours: Number(Math.max(0, toNumber(record.hours, 0)).toFixed(2)),
      };
    })
    .filter((entry) => entry.name.length > 0);
}

function normalizeAttachments(value: unknown): SummarizeResponse["attachments"] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        filename: truncateText(asCompactLine(typeof record.filename === "string" ? record.filename : ""), 140),
        type: truncateText(asCompactLine(typeof record.type === "string" ? record.type : ""), 80) || "unknown-type",
        sizeKb: Math.max(0, Math.round(toNumber(record.sizeKb, 0))),
        note: truncateText(asCompactLine(typeof record.note === "string" ? record.note : ""), 180),
      };
    })
    .filter((entry) => entry.filename.length > 0);
}

export function normalizeSummarizeResponse(
  parsed: unknown,
  issue: IssueContext
): SummarizeResponse {
  if (!parsed || typeof parsed !== "object") {
    return fallbackSummary(issue);
  }

  const record = parsed as Record<string, unknown>;
  const fallback = fallbackSummary(issue);

  const timeSpentRaw = (record.timeSpent ?? {}) as Record<string, unknown>;
  const timeSpent: SummarizeResponse["timeSpent"] = {
    totalHours: Number(Math.max(0, toNumber(timeSpentRaw.totalHours, fallback.timeSpent.totalHours)).toFixed(2)),
    entryCount: Math.max(0, Math.round(toNumber(timeSpentRaw.entryCount, fallback.timeSpent.entryCount))),
    byActivity: normalizeHoursList(timeSpentRaw.byActivity),
    byAuthor: normalizeHoursList(timeSpentRaw.byAuthor),
  };

  if (timeSpent.byActivity.length === 0) {
    timeSpent.byActivity = fallback.timeSpent.byActivity;
  }
  if (timeSpent.byAuthor.length === 0) {
    timeSpent.byAuthor = fallback.timeSpent.byAuthor;
  }

  return {
    summary: truncateText(asCompactLine(typeof record.summary === "string" ? record.summary : ""), 600) || fallback.summary,
    keyPoints: asStringList(record.keyPoints, 6, 220),
    actionItems: asStringList(record.actionItems, 6, 220),
    risks: asStringList(record.risks, 5, 220),
    openQuestions: asStringList(record.openQuestions, 5, 220),
    timeline: normalizeTimeline(record.timeline),
    timeSpent,
    attachments: normalizeAttachments(record.attachments),
    confidence: Math.min(1, Math.max(0, toNumber(record.confidence, fallback.confidence))),
  };
}
