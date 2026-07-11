import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatFab } from "@/src/components/ai/ChatFab";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

describe("ChatFab component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("renders closed state with chat button", () => {
    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    expect(button).toBeInTheDocument();
  });

  it("opens chat panel when button clicked", () => {
    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    expect(screen.getByText("💬 AI Chat")).toBeInTheDocument();
    expect(screen.getByText("Ask about #123")).toBeInTheDocument();
  });

  it("loads chat history when opened", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
      }),
    });

    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there!")).toBeInTheDocument();
    });
  });

  it("shows empty state when no messages", () => {
    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    expect(screen.getByText("🤖")).toBeInTheDocument();
    expect(screen.getByText("Ask me anything about this issue")).toBeInTheDocument();
  });

  it("sends message when form submitted", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "AI response" }),
      });

    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    const input = screen.getByPlaceholderText("Ask a question...");
    fireEvent.change(input, { target: { value: "Test message" } });

    const form = screen.getByRole("textbox").closest("form");
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redmineIssueId: 123, messages: [{ role: "user", content: "Test message" }] }),
    });
  });

  it("shows error when message sending fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Chat failed" }),
      });

    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    const input = screen.getByPlaceholderText("Ask a question...");
    fireEvent.change(input, { target: { value: "Test message" } });

    const form = screen.getByRole("textbox").closest("form");
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText("Chat failed")).toBeInTheDocument();
    });
  });

  it("clears chat when clear button clicked", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    const clearButton = screen.getByText("Clear");
    fireEvent.click(clearButton);

    expect(screen.getByText("Ask me anything about this issue")).toBeInTheDocument();
  });

  it("closes chat when close button clicked", () => {
    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    const closeButton = screen.getByText("✕");
    fireEvent.click(closeButton);

    expect(screen.queryByText("💬 AI Chat")).not.toBeInTheDocument();
    expect(screen.getByTitle("AI Chat")).toBeInTheDocument();
  });

  it("displays metrics for assistant messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            role: "assistant",
            content: "Here's the info",
            totalDuration: "1500000000",
            evalCount: 100,
            promptEvalCount: 50,
          },
        ],
      }),
    });

    render(<ChatFab issueId={123} />);
    const button = screen.getByTitle("AI Chat");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("⏱ 1.5s")).toBeInTheDocument();
      expect(screen.getByText("📤 100 tokens")).toBeInTheDocument();
      expect(screen.getByText("📥 50 tokens")).toBeInTheDocument();
    });
  });
});
