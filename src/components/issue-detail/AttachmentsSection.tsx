"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { attachmentUrl, isImageAttachment, isPdfAttachment } from "@/src/lib/issue-utils";
import type { Attachment } from "@/src/types/dashboard";

interface AttachmentsSectionProps {
  attachments: Attachment[];
  redmineIssueId: number | null;
  onImageClick: (src: string, alt: string) => void;
}

export function AttachmentsSection({
  attachments,
  redmineIssueId,
  onImageClick,
}: AttachmentsSectionProps) {
  const { t } = useI18n();

  return (
    <article className="report-card">
      <details className="issue-collapsible">
        <summary>
          {t("issues.sections.attachments")} <span className="muted">({attachments.length})</span>
        </summary>
        <div className="timeline">
          {attachments.length === 0 && <p className="muted">{t("issues.empty.attachments")}</p>}
          {attachments.map((attachment) => {
            const url = redmineIssueId
              ? attachmentUrl(redmineIssueId, attachment.redmineAttachmentId)
              : "";
            return (
              <div key={attachment.id} className="timeline-item timeline-item-attachment">
                <div className="entry-head">
                  <a href={url} target="_blank" rel="noreferrer">
                    {attachment.filename}
                  </a>
                  <span className="muted">{(attachment.filesize / 1024).toFixed(1)} KB</span>
                </div>
                {isImageAttachment(attachment) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="attachment-preview-image clickable"
                    src={url}
                    alt={attachment.filename}
                    loading="lazy"
                    style={{ maxWidth: "520px", height: "auto", cursor: "zoom-in" }}
                    onClick={() => onImageClick(url, attachment.filename)}
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const link = target.parentElement?.querySelector("a");
                      if (link) {
                        link.textContent = `${attachment.filename} (click to view)`;
                      }
                    }}
                  />
                )}
                {isPdfAttachment(attachment) && (
                  <iframe
                    className="attachment-preview-pdf"
                    src={url}
                    title={`Preview ${attachment.filename}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}
