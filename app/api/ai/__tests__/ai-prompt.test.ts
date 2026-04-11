import { describe, it, expect } from "vitest";
import {
  formatIssueForPrompt,
  createSummarizeMessages,
  createCategorizeMessages,
  createSearchMessages,
  parseJsonResponse,
  SYSTEM_PROMPTS,
  type IssueContext,
} from "@/src/lib/ai-prompt";

describe("ai-prompt utilities", () => {
  const mockIssue: IssueContext = {
    id: "test-id-123",
    redmineIssueId: 42,
    subject: "Fix login bug",
    description: "Users cannot login when password contains special characters",
    projectName: "My Project",
    tracker: "Bug",
    priority: "High",
    statusId: 1,
    statusName: "New",
    assignedToName: "John Doe",
    dueDate: "2024-12-31",
    doneRatio: 0,
    updatedOn: "2024-01-15T10:00:00Z",
  };

  describe("formatIssueForPrompt", () => {
    it("should format issue correctly", () => {
      const result = formatIssueForPrompt(mockIssue);

      expect(result).toContain("Issue #42: Fix login bug");
      expect(result).toContain("Status: New (0% complete)");
      expect(result).toContain("Type: Bug");
      expect(result).toContain("Priority: High");
      expect(result).toContain("Project: My Project");
      expect(result).toContain("Assigned to: John Doe");
      expect(result).toContain("Due: 2024-12-31");
      expect(result).toContain("Description:");
      expect(result).toContain("Users cannot login");
    });

    it("should handle missing optional fields", () => {
      const minimalIssue: IssueContext = {
        id: "min-id",
        redmineIssueId: 1,
        subject: "Test",
        statusId: 1,
        statusName: "Open",
        updatedOn: "2024-01-01",
      };

      const result = formatIssueForPrompt(minimalIssue);

      expect(result).toContain("Issue #1: Test");
      expect(result).toContain("Status: Open");
      expect(result).not.toContain("Type:");
      expect(result).not.toContain("Priority:");
      expect(result).not.toContain("Description:");
    });
  });

  describe("createSummarizeMessages", () => {
    it("should create messages with system prompt and user content", () => {
      const messages = createSummarizeMessages(mockIssue);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe(SYSTEM_PROMPTS.summarize);
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toContain("Fix login bug");
    });
  });

  describe("createCategorizeMessages", () => {
    it("should create messages with categorization prompt", () => {
      const messages = createCategorizeMessages(mockIssue);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe(SYSTEM_PROMPTS.categorize);
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toContain("Fix login bug");
    });
  });

  describe("createSearchMessages", () => {
    it("should create search messages with query and issues", () => {
      const issues = [mockIssue];
      const messages = createSearchMessages("login problem", issues);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe(SYSTEM_PROMPTS.search);
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toContain('"login problem"');
      expect(messages[1].content).toContain("Fix login bug");
    });
  });

  describe("parseJsonResponse", () => {
    it("should parse valid JSON", () => {
      const json = '{"summary": "Test summary", "keyPoints": ["point1"]}';
      const result = parseJsonResponse<{ summary: string; keyPoints: string[] }>(json);

      expect(result).toEqual({
        summary: "Test summary",
        keyPoints: ["point1"],
      });
    });

    it("should extract JSON from text", () => {
      const text = 'Here is the result: {"summary": "Test", "count": 5} for you';
      const result = parseJsonResponse(text);

      expect(result).toEqual({
        summary: "Test",
        count: 5,
      });
    });

    it("should return null for invalid JSON", () => {
      const text = "This is not JSON at all";
      const result = parseJsonResponse(text);

      expect(result).toBeNull();
    });

    it("should handle JSON with extra text before", () => {
      const text = '{"key": "value"} and some more text';
      const result = parseJsonResponse(text);

      expect(result).toEqual({ key: "value" });
    });
  });
});
