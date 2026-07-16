import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AiChatHistoryClient } from "../ai-chat-history-client";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

function makeMessage(overrides: Partial<Parameters<typeof AiChatHistoryClient>[0]["messages"][number]>) {
  return {
    id: "msg-1",
    role: "user",
    content: "hello",
    model: null,
    totalDuration: null,
    loadDuration: null,
    promptEvalCount: null,
    promptEvalDuration: null,
    evalCount: null,
    evalDuration: null,
    createdAt: new Date("2026-07-02T23:30:17.766Z"),
    issue: {
      id: "issue-1",
      redmineIssueId: 12345,
      localIssueNumber: null,
      redmineBaseUrl: "https://redmine.example.com",
      subject: "Some ticket",
      statusName: "Open",
    },
    ...overrides,
  };
}

describe("AiChatHistoryClient", () => {
  // Regression: a real chat message can have issueId=null (AiChatMessage.issueId
  // is nullable), which Prisma's include resolves to issue: null. The Flat view
  // used to do `msg.issue!.redmineIssueId` — a non-null assertion that lies at
  // runtime — and crashed the whole page with "Cannot read properties of null".
  it("renders Flat view without crashing when a message has no linked issue", () => {
    const messages = [
      makeMessage({ id: "msg-null-1", issue: null }),
      makeMessage({ id: "msg-null-2", role: "assistant", issue: null }),
    ];

    render(<AiChatHistoryClient messages={messages} />);
    fireEvent.click(screen.getByText(/Flat/));

    expect(screen.getAllByText("No linked issue")).toHaveLength(2);
  });

  it("still renders the issue link for messages that do have one", () => {
    const messages = [makeMessage({ id: "msg-linked" })];

    render(<AiChatHistoryClient messages={messages} />);
    fireEvent.click(screen.getByText(/Flat/));

    expect(screen.getByText(/Some ticket/)).toBeInTheDocument();
  });

  it("search filter does not throw on a null-issue message", () => {
    const messages = [
      makeMessage({ id: "msg-null-1", issue: null, content: "unlinked chat content" }),
    ];

    render(<AiChatHistoryClient messages={messages} />);
    fireEvent.click(screen.getByText(/Flat/));
    fireEvent.change(screen.getByPlaceholderText("Search messages..."), {
      target: { value: "unlinked" },
    });

    expect(screen.getByText(/unlinked chat content/)).toBeInTheDocument();
  });

  it("Grouped view skips null-issue messages entirely (pre-existing correct behavior)", () => {
    const messages = [makeMessage({ id: "msg-null-1", issue: null })];

    render(<AiChatHistoryClient messages={messages} />);

    expect(screen.getByText(/Grouped \(0\)/)).toBeInTheDocument();
  });
});
