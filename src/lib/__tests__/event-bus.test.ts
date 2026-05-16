import { describe, expect, it, beforeEach, vi } from "vitest";

import { emitEvent, listenerCount, subscribe } from "@/src/lib/event-bus";

describe("event-bus", () => {
  beforeEach(() => {
    // Drain any subscribers from previous tests (the bus is a module-level
    // singleton intentionally — guarantees in-process delivery across both
    // poller and SSE route handlers).
    const g = globalThis as { __converge_event_bus__?: Set<unknown> };
    g.__converge_event_bus__?.clear();
  });

  it("delivers events to subscribers and unsubscribes cleanly", () => {
    const received: string[] = [];
    const off = subscribe((event) => {
      received.push(event.type);
    });
    expect(listenerCount()).toBe(1);

    emitEvent({
      type: "issue.created",
      userId: "u1",
      redmineIssueId: 7,
      issueId: "i1",
    });
    expect(received).toEqual(["issue.created"]);

    off();
    expect(listenerCount()).toBe(0);

    emitEvent({
      type: "issue.updated",
      userId: "u1",
      redmineIssueId: 7,
      issueId: "i1",
    });
    expect(received).toEqual(["issue.created"]);
  });

  it("auto-stamps ts when missing", () => {
    let captured: { ts: number } | null = null;
    subscribe((event) => {
      captured = event as unknown as { ts: number };
    });

    emitEvent({
      type: "sync.tick.completed",
      durationMs: 12,
      issueCount: 4,
    });

    expect(captured!.ts).toEqual(expect.any(Number));
  });

  it("does not crash producers when a listener throws", () => {
    const second = vi.fn();
    subscribe(() => {
      throw new Error("boom");
    });
    subscribe(second);

    expect(() =>
      emitEvent({
        type: "issue.updated",
        userId: "u1",
        redmineIssueId: 1,
        issueId: "i1",
      }),
    ).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
