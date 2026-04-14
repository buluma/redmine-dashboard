import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiSearchBar } from "@/src/components/ai/AiSearchBar";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("AiSearchBar component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("renders search input and button", () => {
    render(<AiSearchBar />);
    expect(screen.getByPlaceholderText("Ask AI to find relevant issues...")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("does not search when query is empty", async () => {
    render(<AiSearchBar />);
    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends search request when search button clicked", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        insights: null,
      }),
    });

    render(<AiSearchBar />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "urgent bugs" } });

    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    expect(mockFetch).toHaveBeenCalledWith("/api/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "urgent bugs", limit: 10 }),
    });
  });

  it("sends search request when Enter key pressed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        insights: null,
      }),
    });

    render(<AiSearchBar />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "urgent bugs" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockFetch).toHaveBeenCalledWith("/api/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "urgent bugs", limit: 10 }),
    });
  });

  it("displays loading state while searching", async () => {
    mockFetch.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({ results: [], insights: null }) }), 100))
    );

    render(<AiSearchBar />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "urgent bugs" } });

    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    expect(screen.getByText("AI is searching...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("AI is searching...")).not.toBeInTheDocument();
    });
  });

  it("displays search results", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            issueId: "issue_1",
            relevance: 0.95,
            explanation: "High priority bug",
            issue: {
              id: "issue_1",
              redmineIssueId: 456,
              subject: "Critical bug fix",
              statusName: "Open",
              projectName: "Test Project",
            },
          },
        ],
        insights: "Found 1 critical issue",
      }),
    });

    render(<AiSearchBar />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "urgent bugs" } });

    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("💡 AI Insights")).toBeInTheDocument();
      expect(screen.getByText("Found 1 critical issue")).toBeInTheDocument();
      expect(screen.getByText("#456")).toBeInTheDocument();
      expect(screen.getByText("Critical bug fix")).toBeInTheDocument();
      expect(screen.getByText("High priority bug")).toBeInTheDocument();
      expect(screen.getByText("95% match")).toBeInTheDocument();
    });
  });

  it("displays error when search fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Search service unavailable" }),
    });

    render(<AiSearchBar />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "urgent bugs" } });

    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Search service unavailable")).toBeInTheDocument();
    });
  });

  it("calls onResults callback when results returned", async () => {
    const onResults = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            issueId: "issue_1",
            relevance: 0.9,
            explanation: "Test result",
          },
        ],
        insights: null,
      }),
    });

    render(<AiSearchBar onResults={onResults} />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(onResults).toHaveBeenCalledWith([
        {
          issueId: "issue_1",
          relevance: 0.9,
          explanation: "Test result",
        },
      ]);
    });
  });

  it("calls onInsights callback when insights returned", async () => {
    const onInsights = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        insights: "Here are your insights",
      }),
    });

    render(<AiSearchBar onInsights={onInsights} />);
    const input = screen.getByPlaceholderText("Ask AI to find relevant issues...");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByText("Search");
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(onInsights).toHaveBeenCalledWith("Here are your insights");
    });
  });
});
