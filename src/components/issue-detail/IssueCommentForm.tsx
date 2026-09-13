"use client";

import { useI18n } from "@/src/components/I18nProvider";

type IssueCommentFormProps = {
  value: string;
  busy: boolean;
  actionError: string | null;
  actionInfo: string | null;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
};

export function IssueCommentForm({
  value,
  busy,
  actionError,
  actionInfo,
  onChange,
  onSubmit,
}: IssueCommentFormProps) {
  const { t } = useI18n();

  return (
    <article className="report-card comment-card">
      <div className="comment-card-head">
        <div>
          <p className="report-label">Redmine Comment</p>
          <p className="muted">Add a note to this issue in Redmine.</p>
        </div>
      </div>
      {actionError && <p className="error-banner">{actionError}</p>}
      {actionInfo && <p className="info-banner">{actionInfo}</p>}
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit();
        }}
      >
        <label>
          Comment
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("issues.placeholders.comment")}
            rows={4}
          />
        </label>
        <button type="submit" disabled={busy || value.trim().length === 0}>
          {busy ? t("common.loading") : t("issues.actions.postToRedmine")}
        </button>
      </form>
    </article>
  );
}
