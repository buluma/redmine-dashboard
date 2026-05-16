import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AttachmentsSection } from "@/src/components/issue-detail/AttachmentsSection";
import type { Attachment } from "@/src/types/dashboard";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function makeAttachment(over: Partial<Attachment> = {}): Attachment {
  return {
    id: "a1",
    redmineAttachmentId: 11,
    filename: "screenshot.png",
    filesize: 2048,
    contentType: "image/png",
    author: "Alice",
    createdOnRemote: "2026-05-01",
    ...over,
  };
}

describe("AttachmentsSection", () => {
  it("renders the empty state when there are no attachments", () => {
    render(
      <AttachmentsSection attachments={[]} redmineIssueId={42} onImageClick={vi.fn()} />,
    );
    expect(screen.getByText("issues.empty.attachments")).toBeInTheDocument();
  });

  it("renders attachments and triggers image click", () => {
    const onImageClick = vi.fn();
    render(
      <AttachmentsSection
        attachments={[makeAttachment()]}
        redmineIssueId={42}
        onImageClick={onImageClick}
      />,
    );

    const link = screen.getByRole("link", { name: "screenshot.png" });
    expect(link).toBeInTheDocument();

    const img = screen.getByAltText("screenshot.png") as HTMLImageElement;
    fireEvent.click(img);
    expect(onImageClick).toHaveBeenCalledWith(expect.stringContaining("11"), "screenshot.png");
  });

  it("renders a PDF iframe for PDF attachments", () => {
    render(
      <AttachmentsSection
        attachments={[
          makeAttachment({
            id: "a2",
            filename: "report.pdf",
            contentType: "application/pdf",
            redmineAttachmentId: 22,
          }),
        ]}
        redmineIssueId={42}
        onImageClick={vi.fn()}
      />,
    );

    const iframe = screen.getByTitle("Preview report.pdf");
    expect(iframe.tagName).toBe("IFRAME");
  });

  it("renders a blank URL when redmineIssueId is null", () => {
    render(
      <AttachmentsSection
        attachments={[makeAttachment()]}
        redmineIssueId={null}
        onImageClick={vi.fn()}
      />,
    );
    const link = screen.getByText("screenshot.png");
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("");
  });
});
