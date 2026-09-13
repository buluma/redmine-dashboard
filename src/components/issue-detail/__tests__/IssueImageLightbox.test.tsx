import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssueImageLightbox } from "@/src/components/issue-detail/IssueImageLightbox";

describe("IssueImageLightbox", () => {
  it("renders the selected image and caption", () => {
    render(<IssueImageLightbox image={{ src: "/attachment.png", alt: "Attachment preview" }} onClose={vi.fn()} />);
    expect(screen.getByAltText("Attachment preview")).toHaveAttribute("src", "/attachment.png");
    expect(screen.getByText("Attachment preview")).toHaveClass("lightbox-caption");
  });

  it("closes from the overlay and close button", () => {
    const onClose = vi.fn();
    const { container } = render(<IssueImageLightbox image={{ src: "/attachment.png", alt: "Attachment preview" }} onClose={onClose} />);

    fireEvent.click(container.querySelector(".lightbox-overlay")!);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close when clicking inside the lightbox content", () => {
    const onClose = vi.fn();
    const { container } = render(<IssueImageLightbox image={{ src: "/attachment.png", alt: "Attachment preview" }} onClose={onClose} />);

    fireEvent.click(container.querySelector(".lightbox-content")!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
