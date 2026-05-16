"use client";

import { useState, type ReactNode } from "react";

import { useI18n } from "@/src/components/I18nProvider";
import type { InternalNote } from "@/src/hooks/useInternalNotes";

interface InternalNotesSectionProps {
  notes: InternalNote[];
  busy: boolean;
  onCreate: (content: string) => Promise<void>;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  /** Caller renders markdown so the host page can use its own MarkdownBlock. */
  renderMarkdown: (content: string) => ReactNode;
  formatAgo: (iso: string) => string;
  actionError?: string | null;
}

export function InternalNotesSection({
  notes,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  renderMarkdown,
  formatAgo,
  actionError,
}: InternalNotesSectionProps) {
  const { t } = useI18n();
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const content = newNoteContent.trim();
    if (!content) return;
    await onCreate(content);
    setNewNoteContent("");
  }

  return (
    <div className="internal-notes-section">
      {actionError && <p className="error-banner">{actionError}</p>}
      <form className="form" onSubmit={handleCreate}>
        <label>
          {t("issues.tabs.internalNotes")}
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder={t("issues.placeholders.internalNote")}
            rows={3}
          />
        </label>
        <button type="submit" disabled={busy || newNoteContent.trim().length === 0}>
          {busy ? t("common.loading") : t("issues.actions.save")}
        </button>
      </form>
      <div className="internal-notes-list">
        {notes.length === 0 && <p className="muted">{t("issues.empty.notes")}</p>}
        {notes.map((note) => (
          <article key={note.id} className="internal-note-item">
            <div className="internal-note-head">
              <span className="internal-note-author">{note.authorName}</span>
              <span className="internal-note-date">{formatAgo(new Date(note.createdAt).toISOString())}</span>
              <div className="internal-note-actions">
                {editingNoteId !== note.id && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingNoteId(note.id);
                      setEditNoteContent(note.content);
                    }}
                  >
                    {t("common.edit")}
                  </button>
                )}
                <button
                  type="button"
                  className="internal-note-delete"
                  onClick={() => {
                    if (confirm(t("issues.actions.confirmDeleteNote"))) {
                      void onDelete(note.id);
                    }
                  }}
                  title={t("common.delete")}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="internal-note-content">
              {editingNoteId === note.id ? (
                <div className="edit-note-form">
                  <textarea
                    value={editNoteContent}
                    onChange={(e) => setEditNoteContent(e.target.value)}
                    rows={5}
                  />
                  <div className="edit-note-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={async () => {
                        await onUpdate(note.id, editNoteContent);
                        setEditingNoteId(null);
                        setEditNoteContent("");
                      }}
                      disabled={busy || editNoteContent.trim().length === 0}
                    >
                      {busy ? t("common.loading") : t("common.save")}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingNoteId(null);
                        setEditNoteContent("");
                      }}
                      disabled={busy}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                renderMarkdown(note.content)
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
