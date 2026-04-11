import type { OllamaChatMessage } from "./ollama";

export interface IssueContext {
  id: string;
  redmineIssueId: number;
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
    issue.description ? `\nDescription:\n${issue.description}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

export const SYSTEM_PROMPTS = {
  summarize: `You are an expert project manager assistant helping to summarize Redmine issues. Your task is to provide clear, concise summaries of issues that help team members quickly understand the current state and next steps.

Respond ONLY with valid JSON in this exact format:
{
  "summary": "A 2-3 sentence summary of the issue",
  "keyPoints": ["Array of 3-5 key points about the issue"],
  "actionItems": ["Array of 3-5 actionable next steps"],
  "confidence": 0.0-1.0 confidence score
}

Be specific, actionable, and focus on what matters most.`,

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

  chat: `You are a helpful project management assistant integrated into a Redmine dashboard. You help users understand their issues, suggest improvements, and answer questions about their project work.

Keep responses concise and actionable. When helpful, reference specific issues by their ID number. Be friendly but professional.`,
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
