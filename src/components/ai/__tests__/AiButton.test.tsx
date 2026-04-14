import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiButton } from "@/src/components/ai/AiButton";

describe("AiButton component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with children and spark icon", () => {
    render(<AiButton onClick={async () => {}}>Summarize</AiButton>);
    expect(screen.getByText("Summarize")).toBeInTheDocument();
  });

  it("calls onClick handler when clicked", async () => {
    const handleClick = vi.fn().mockResolvedValue(undefined);
    render(<AiButton onClick={handleClick}>Summarize</AiButton>);

    const button = screen.getByText("Summarize");
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("shows loading state while async operation in progress", async () => {
    const handleClick = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<AiButton onClick={handleClick}>Summarize</AiButton>);

    const button = screen.getByText("Summarize");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("AI thinking...")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });
  });

  it("disables button while loading", async () => {
    const handleClick = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<AiButton onClick={handleClick}>Summarize</AiButton>);

    const button = screen.getByText("Summarize");
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it("respects disabled prop", () => {
    render(
      <AiButton onClick={async () => {}} disabled>
        Summarize
      </AiButton>
    );

    const button = screen.getByText("Summarize");
    expect(button).toBeDisabled();
  });

  it("does not call onClick when disabled", async () => {
    const handleClick = vi.fn().mockResolvedValue(undefined);

    render(
      <AiButton onClick={handleClick} disabled>
        Summarize
      </AiButton>
    );

    const button = screen.getByText("Summarize");
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders with primary variant styles", () => {
    const { container } = render(
      <AiButton onClick={async () => {}} variant="primary">
        Primary
      </AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("bg-blue-600");
  });

  it("renders with secondary variant styles", () => {
    const { container } = render(
      <AiButton onClick={async () => {}} variant="secondary">
        Secondary
      </AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("bg-gray-100");
  });

  it("renders with ghost variant styles", () => {
    const { container } = render(
      <AiButton onClick={async () => {}} variant="ghost">
        Ghost
      </AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("text-gray-600");
  });

  it("renders with small size by default", () => {
    const { container } = render(
      <AiButton onClick={async () => {}}>Small</AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("text-xs");
  });

  it("renders with medium size when specified", () => {
    const { container } = render(
      <AiButton onClick={async () => {}} size="md">
        Medium
      </AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("text-sm");
  });

  it("renders with large size when specified", () => {
    const { container } = render(
      <AiButton onClick={async () => {}} size="lg">
        Large
      </AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("text-base");
  });

  it("renders custom loading component when provided", async () => {
    const handleClick = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );
    const customLoading = <span data-testid="custom-loader">Loading...</span>;

    render(
      <AiButton onClick={handleClick} loadingComponent={customLoading}>
        Summarize
      </AiButton>
    );

    const button = screen.getByText("Summarize");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("custom-loader")).toBeInTheDocument();
    });
  });

  it("applies custom className", () => {
    const { container } = render(
      <AiButton onClick={async () => {}} className="custom-class">
        Custom
      </AiButton>
    );

    const button = container.firstChild as HTMLElement;
    expect(button.className).toContain("custom-class");
  });

  it("handles multiple clicks correctly", async () => {
    const handleClick = vi.fn().mockResolvedValue(undefined);

    render(<AiButton onClick={handleClick}>Summarize</AiButton>);

    const button = screen.getByText("Summarize");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // Only first click should proceed
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
