"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import { isLocalOnlyIssue } from "@/src/lib/issue-shape";
import type { IssueMetadataDraft } from "@/src/components/issue-detail/IssueStandardMetadataFields";
import type { Issue } from "@/src/hooks/useIssueDetail";

export type IssueEditDraft = IssueMetadataDraft & {
  subject: string;
  description: string;
  customFields: Record<string, string>;
};

export interface UseIssueEditDraftResult {
  editMode: boolean;
  editDraft: IssueEditDraft | null;
  setEditDraft: Dispatch<SetStateAction<IssueEditDraft | null>>;
  editSaving: boolean;
  startEditMode: (issue: Issue) => void;
  saveEdit: (issue: Issue) => Promise<void>;
  cancelEditMode: () => void;
  updateCustomField: (fieldId: string, value: string) => void;
}

interface Options {
  onSaved: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  t: (key: string, variables?: Record<string, string | number> | string) => string;
}

/**
 * Owns the issue-detail page's "edit metadata" flow: the draft state itself,
 * and the two different save paths a ticket can take (a true local-only
 * issue PATCHes the local API directly; a real Redmine ticket — including
 * source:"local" hybrid mirrors that carry a redmineIssueId — PUTs via
 * Redmine then re-syncs, so the edit lands before the next poll cycle pulls
 * Redmine's copy back over it).
 */
export function useIssueEditDraft({ onSaved, onSuccess, onError, t }: Options): UseIssueEditDraftResult {
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<IssueEditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  function startEditMode(issue: Issue) {
    const customFields: Record<string, string> = {};
    if (issue.customFieldsJson) {
      for (const field of issue.customFieldsJson) {
        customFields[field.id] = field.value ?? "";
      }
    }
    setEditDraft({
      subject: issue.subject,
      description: issue.description ?? "",
      priorityId: issue.priorityId != null ? String(issue.priorityId) : "",
      dueDate: issue.dueDate ? new Date(issue.dueDate).toISOString().split("T")[0] : "",
      estimatedHours: issue.estimatedHours != null ? String(issue.estimatedHours) : "",
      startDate: issue.startDate ? new Date(issue.startDate).toISOString().split("T")[0] : "",
      categoryId: issue.categoryId != null ? String(issue.categoryId) : "",
      customFields,
    });
    setEditMode(true);
  }

  async function saveEdit(issue: Issue) {
    if (!editDraft) return;
    setEditSaving(true);
    try {
      let res: Response;

      if (isLocalOnlyIssue(issue)) {
        res = await fetch(`/api/issues/local/${issue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editDraft.subject || undefined,
            description: editDraft.description || null,
            tracker: issue.tracker ?? null,
            priority: editDraft.priorityId ? undefined : (issue.priority ?? null),
            priorityId: editDraft.priorityId ? parseInt(editDraft.priorityId, 10) : undefined,
            statusId: issue.statusId,
            statusName: issue.statusName,
            dueDate: editDraft.dueDate
              ? new Date(`${editDraft.dueDate}T00:00:00`).toISOString()
              : editDraft.dueDate === "" ? null : undefined,
            startDate: editDraft.startDate
              ? new Date(`${editDraft.startDate}T00:00:00`).toISOString()
              : editDraft.startDate === "" ? null : undefined,
            estimatedHours: editDraft.estimatedHours ? parseFloat(editDraft.estimatedHours) : undefined,
            doneRatio: issue.doneRatio ?? 0,
            parentIssueId: issue.parentIssueId ?? undefined,
            parentIssueLabel: issue.parentIssueLabel ?? undefined,
          }),
        });
      } else {
        res = await fetch(`/api/issues/${issue.id}/edit`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editDraft.subject || undefined,
            description: editDraft.description,
            priorityId: editDraft.priorityId ? parseInt(editDraft.priorityId, 10) : undefined,
            dueDate: editDraft.dueDate || undefined,
            estimatedHours: editDraft.estimatedHours ? parseFloat(editDraft.estimatedHours) : undefined,
            startDate: editDraft.startDate || undefined,
            categoryId: editDraft.categoryId ? parseInt(editDraft.categoryId, 10) : undefined,
            customFields: Object.entries(editDraft.customFields)
              .filter(([, v]) => v !== "")
              .map(([fieldId, value]) => ({ id: parseInt(fieldId, 10), value })),
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update issue");
      }
      await onSaved();
      setEditMode(false);
      setEditDraft(null);
      onSuccess(
        isLocalOnlyIssue(issue)
          ? t("issues.messages.personalUpdated")
          : t("issues.messages.redmineUpdated"),
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to update issue");
    } finally {
      setEditSaving(false);
    }
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditDraft(null);
  }

  function updateCustomField(fieldId: string, value: string) {
    setEditDraft((current) =>
      current ? { ...current, customFields: { ...current.customFields, [fieldId]: value } } : current,
    );
  }

  return {
    editMode,
    editDraft,
    setEditDraft,
    editSaving,
    startEditMode,
    saveEdit,
    cancelEditMode,
    updateCustomField,
  };
}
