"use client";

import { useCallback, useEffect, useState } from "react";

export interface InternalNote {
  id: string;
  issueId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
}

export interface UseInternalNotesResult {
  notes: InternalNote[];
  load: () => Promise<void>;
  create: (content: string) => Promise<void>;
  update: (noteId: string, content: string) => Promise<void>;
  remove: (noteId: string) => Promise<void>;
  busy: boolean;
}

interface Options {
  enabled: boolean;
  issueId: string | null | undefined;
  onError: (message: string) => void;
  onInfo?: (message: string) => void;
  /**
   * i18n bridge so the hook can stay UI-framework-free. Keys mirror
   * what the issue-detail page passes today.
   */
  t: (key: string, variables?: Record<string, string | number> | string) => string;
}

export function useInternalNotes({
  enabled,
  issueId,
  onError,
  onInfo,
  t,
}: Options): UseInternalNotesResult {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!issueId) return;
    try {
      const res = await fetch(`/api/internal/notes?issueId=${issueId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? []);
      }
    } catch {
      // Ignore transient errors.
    }
  }, [issueId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const create = useCallback(
    async (content: string) => {
      if (!issueId || !content.trim() || busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/internal/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueId, content: content.trim() }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || t("issues.messages.noteFailed"));
        }
        await load();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Failed to add note");
      } finally {
        setBusy(false);
      }
    },
    [busy, issueId, load, onError, t],
  );

  const update = useCallback(
    async (noteId: string, content: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/internal/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content.trim() }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || t("issues.messages.noteUpdateFailed"));
        }
        await load();
        onInfo?.(t("issues.messages.noteUpdated"));
      } catch (e) {
        onError(e instanceof Error ? e.message : t("issues.messages.noteUpdateFailed"));
      } finally {
        setBusy(false);
      }
    },
    [load, onError, onInfo, t],
  );

  const remove = useCallback(
    async (noteId: string) => {
      try {
        const res = await fetch(`/api/internal/notes/${noteId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(t("issues.messages.noteFailed"));
        await load();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Failed to delete note");
      }
    },
    [load, onError, t],
  );

  return { notes, load, create, update, remove, busy };
}
