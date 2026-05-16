import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { useInternalNotes, type InternalNote } from "@/src/hooks/useInternalNotes";

const t = (key: string) => key;

function makeNote(over: Partial<InternalNote> = {}): InternalNote {
  return {
    id: "n1",
    issueId: "i1",
    content: "hello",
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
    authorId: "u1",
    authorName: "Tester",
    ...over,
  };
}

function mockFetch(seq: Array<Response | Promise<Response>>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    calls.push({ url: String(url), init: init as RequestInit });
    const next = seq.shift();
    if (!next) throw new Error("Unexpected fetch");
    return next instanceof Response ? next : next;
  });
  return { fetchMock, calls };
}

describe("useInternalNotes", () => {
  let fetchMock: MockInstance | null = null;

  beforeEach(() => {
    fetchMock?.mockRestore();
    fetchMock = null;
  });

  it("does nothing when disabled", () => {
    const onError = vi.fn();
    const m = mockFetch([]);
    fetchMock = m.fetchMock;
    renderHook(() =>
      useInternalNotes({ enabled: false, issueId: "i1", onError, t }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads notes when enabled", async () => {
    const m = mockFetch([
      new Response(JSON.stringify({ notes: [makeNote()] }), { status: 200 }),
    ]);
    fetchMock = m.fetchMock;
    const { result } = renderHook(() =>
      useInternalNotes({ enabled: true, issueId: "i1", onError: vi.fn(), t }),
    );

    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(m.calls[0].url).toBe("/api/internal/notes?issueId=i1");
  });

  it("create posts and refetches", async () => {
    const m = mockFetch([
      new Response(JSON.stringify({ notes: [] }), { status: 200 }), // initial load
      new Response(JSON.stringify({ ok: true }), { status: 201 }), // create
      new Response(JSON.stringify({ notes: [makeNote({ content: "x" })] }), {
        status: 200,
      }), // reload
    ]);
    fetchMock = m.fetchMock;
    const { result } = renderHook(() =>
      useInternalNotes({ enabled: true, issueId: "i1", onError: vi.fn(), t }),
    );
    await waitFor(() => expect(m.calls).toHaveLength(1));

    await act(async () => {
      await result.current.create("x");
    });

    expect(m.calls[1].url).toBe("/api/internal/notes");
    expect(m.calls[1].init?.method).toBe("POST");
    expect(result.current.notes[0]?.content).toBe("x");
  });

  it("update sends PATCH and emits onInfo", async () => {
    const onInfo = vi.fn();
    const m = mockFetch([
      new Response(JSON.stringify({ notes: [makeNote()] }), { status: 200 }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
      new Response(JSON.stringify({ notes: [makeNote({ content: "edited" })] }), {
        status: 200,
      }),
    ]);
    fetchMock = m.fetchMock;
    const { result } = renderHook(() =>
      useInternalNotes({ enabled: true, issueId: "i1", onError: vi.fn(), onInfo, t }),
    );
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.update("n1", "edited");
    });

    expect(m.calls[1].url).toBe("/api/internal/notes/n1");
    expect(m.calls[1].init?.method).toBe("PATCH");
    expect(onInfo).toHaveBeenCalled();
  });

  it("remove sends DELETE and refetches", async () => {
    const m = mockFetch([
      new Response(JSON.stringify({ notes: [makeNote()] }), { status: 200 }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
      new Response(JSON.stringify({ notes: [] }), { status: 200 }),
    ]);
    fetchMock = m.fetchMock;
    const { result } = renderHook(() =>
      useInternalNotes({ enabled: true, issueId: "i1", onError: vi.fn(), t }),
    );
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.remove("n1");
    });

    expect(m.calls[1].url).toBe("/api/internal/notes/n1");
    expect(m.calls[1].init?.method).toBe("DELETE");
    expect(result.current.notes).toEqual([]);
  });

  it("create surfaces server errors via onError", async () => {
    const onError = vi.fn();
    const m = mockFetch([
      new Response(JSON.stringify({ notes: [] }), { status: 200 }),
      new Response(JSON.stringify({ error: "bad" }), { status: 400 }),
    ]);
    fetchMock = m.fetchMock;
    const { result } = renderHook(() =>
      useInternalNotes({ enabled: true, issueId: "i1", onError, t }),
    );
    await waitFor(() => expect(m.calls).toHaveLength(1));

    await act(async () => {
      await result.current.create("x");
    });

    expect(onError).toHaveBeenCalledWith("bad");
  });
});
