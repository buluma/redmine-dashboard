import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownBlock } from "@/src/components/issue-detail/MarkdownBlock";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string, data?: Record<string, string | number>) => `${key}:${data?.count ?? ""}` }),
}));

describe("MarkdownBlock", () => {
  it("renders normalized markdown links safely", () => {
    render(<MarkdownBlock content={'"Redmine":https://redmine.example.test/issues/42'} />);

    const link = screen.getByRole("link", { name: "Redmine" });
    expect(link).toHaveAttribute("href", "https://redmine.example.test/issues/42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("resolves attachment markers and forwards image clicks", () => {
    const onImageClick = vi.fn();
    render(
      <MarkdownBlock
        content="![Screenshot One.png](/api/issues/_ATTACHMENT_/Screenshot%20One.png)"
        attachments={[{
          id: "attachment-1",
          redmineAttachmentId: 17,
          filename: "Screenshot One.png",
          filesize: 1,
          contentType: "image/png",
          author: null,
          createdOnRemote: null,
        }]}
        issueId={42}
        onImageClick={onImageClick}
      />,
    );

    const image = screen.getByAltText("Screenshot One.png");
    expect(image).toHaveAttribute("src", "/api/issues/42/attachments/17");
    fireEvent.click(image);
    expect(onImageClick).toHaveBeenCalledWith("/api/issues/42/attachments/17", "Screenshot One.png");
  });

  it("collapses long code blocks but preserves code in Redmine collapse sections", () => {
    const longCode = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n");
    const { container } = render(
      <MarkdownBlock content={`\`\`\`\n${longCode}\n\`\`\`\n\n{{collapse(Details)\n\`\`\`\n${longCode}\n\`\`\`\n}}`} />,
    );

    expect(screen.getByText("issues.showCode:10")).toBeInTheDocument();
    expect(container.querySelectorAll("details.md-collapsible-code")).toHaveLength(1);
    expect(container.querySelector("details.redmine-collapse pre")).toBeInTheDocument();
  });
});
