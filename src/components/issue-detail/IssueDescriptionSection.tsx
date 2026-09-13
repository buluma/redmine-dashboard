"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { MarkdownBlock } from "@/src/components/MarkdownBlock";
import type { Attachment } from "@/src/types/dashboard";

type IssueDescriptionSectionProps = {
  description: string | null;
  attachments: Attachment[];
  redmineIssueId: number | null;
  isEditing: boolean;
  editingDescription: string;
  onDescriptionChange: (value: string) => void;
  onImageClick: (src: string, alt: string) => void;
};

export function IssueDescriptionSection({
  description,
  attachments,
  redmineIssueId,
  isEditing,
  editingDescription,
  onDescriptionChange,
  onImageClick,
}: IssueDescriptionSectionProps) {
  const { t } = useI18n();

  return (
    <article className="report-card issue-description-card">
      <p className="report-label">{t("issues.fields.description")}</p>
      {isEditing ? (
        <textarea
          className="edit-description-textarea"
          value={editingDescription}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={8}
          placeholder={t("issues.placeholders.description")}
        />
      ) : description ? (
        <MarkdownBlock
          content={description}
          attachments={attachments}
          issueId={redmineIssueId ?? undefined}
          onImageClick={onImageClick}
        />
      ) : (
        <p className="muted">{t("issues.empty.noDescription")}</p>
      )}
    </article>
  );
}
