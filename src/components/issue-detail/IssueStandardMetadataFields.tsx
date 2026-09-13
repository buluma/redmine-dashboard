"use client";

import { useI18n } from "@/src/components/I18nProvider";

export type IssueMetadataDraft = {
  startDate: string;
  dueDate: string;
  categoryId: string;
  priorityId: string;
  estimatedHours: string;
};

type IssueStandardMetadataFieldsProps = {
  isEditing: boolean;
  draft: IssueMetadataDraft | null;
  authorName: string | null;
  categoryName: string | null;
  startDate: string | null;
  dueDate: string | null;
  priority: string | null;
  estimatedHours: number | null;
  spentHours: number | null;
  priorities: Array<{ id: number; name: string; isDefault: boolean }>;
  locale: string;
  formatPriority: (priority: string | null) => string;
  onDraftChange: (field: keyof IssueMetadataDraft, value: string) => void;
};

export function IssueStandardMetadataFields({
  isEditing,
  draft,
  authorName,
  categoryName,
  startDate,
  dueDate,
  priority,
  estimatedHours,
  spentHours,
  priorities,
  locale,
  formatPriority,
  onDraftChange,
}: IssueStandardMetadataFieldsProps) {
  const { t } = useI18n();

  if (isEditing && draft) {
    return (
      <>
        <div className="metadata-item metadata-item-editable">
          <span className="metadata-label">{t("issues.fields.startDate")}</span>
          <input type="date" className="edit-metadata-input edit-date-input" value={draft.startDate} onChange={(event) => onDraftChange("startDate", event.target.value)} />
        </div>
        <div className="metadata-item metadata-item-editable">
          <span className="metadata-label">{t("issues.fields.dueDate")}</span>
          <input type="date" className="edit-metadata-input edit-date-input" value={draft.dueDate} onChange={(event) => onDraftChange("dueDate", event.target.value)} />
        </div>
        <div className="metadata-item metadata-item-editable">
          <span className="metadata-label">{t("issues.fields.category")}</span>
          <select className="edit-metadata-input edit-category-select" value={draft.categoryId} onChange={(event) => onDraftChange("categoryId", event.target.value)}>
            <option value="">— {t("issues.empty.noCategory")} —</option>
            <option value="32">activities</option>
            <option value="33">bugs</option>
            <option value="34">features</option>
          </select>
        </div>
        <div className="metadata-item metadata-item-editable">
          <span className="metadata-label">{t("issues.fields.priority")}</span>
          <select className="edit-metadata-input edit-priority-select" value={draft.priorityId} onChange={(event) => onDraftChange("priorityId", event.target.value)}>
            <option value="">— {t("issues.empty.noPriority")} —</option>
            {priorities.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " (default)" : ""}</option>)}
          </select>
        </div>
        <div className="metadata-item metadata-item-editable">
          <span className="metadata-label">{t("issues.fields.estimatedHours")}</span>
          <input type="number" className="edit-metadata-input" value={draft.estimatedHours} onChange={(event) => onDraftChange("estimatedHours", event.target.value)} step="0.25" min="0" placeholder="0" />
        </div>
      </>
    );
  }

  return (
    <>
      {authorName && <div className="metadata-item"><span className="metadata-label">{t("issues.fields.author")}</span><span className="metadata-value">{authorName}</span></div>}
      {categoryName && <div className="metadata-item"><span className="metadata-label">{t("issues.fields.category")}</span><span className="metadata-value">{categoryName}</span></div>}
      {startDate && <div className="metadata-item"><span className="metadata-label">{t("issues.fields.startDate")}</span><span className="metadata-value">{new Date(startDate).toLocaleDateString(locale)}</span></div>}
      {dueDate && <div className="metadata-item"><span className="metadata-label">{t("issues.fields.dueDate")}</span><span className="metadata-value">{new Date(dueDate).toLocaleDateString(locale)}</span></div>}
      {priority && <div className="metadata-item"><span className="metadata-label">{t("issues.fields.priority")}</span><span className="metadata-value">{formatPriority(priority)}</span></div>}
      {estimatedHours != null && <div className="metadata-item"><span className="metadata-label">{t("issues.fields.estimatedHours")}</span><span className="metadata-value">{estimatedHours.toFixed(2)}h</span></div>}
      {spentHours != null && <div className="metadata-item metadata-item-readonly"><span className="metadata-label">{t("issues.fields.spentHours")} (Redmine)</span><span className="metadata-value">{spentHours.toFixed(2)}h</span></div>}
    </>
  );
}
