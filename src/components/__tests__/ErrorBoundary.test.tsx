import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";

// Component that throws an error
const ThrowError = () => {
  throw new Error("Test error");
};

describe("ErrorBoundary component", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("renders fallback when error occurs", () => {
    const fallback = <div>Fallback content</div>;

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Fallback content")).toBeInTheDocument();
  });

  it("renders default error UI when no fallback provided", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it("provides retry button that resets error state", () => {
    let shouldThrow = true;
    const ConditionalThrow = () => {
      if (shouldThrow) {
        throw new Error("Test error");
      }
      return <div>Recovered</div>;
    };

    render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    const retryButton = screen.getByText("Try Again");
    shouldThrow = false;
    fireEvent.click(retryButton);

    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("provides reload page button", () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByText("Reload Page");
    fireEvent.click(reloadButton);

    expect(reloadMock).toHaveBeenCalled();
  });

  it("displays error message from caught error", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it("displays generic message when error has no message", () => {
    const ThrowNoMessage = () => {
      throw new Error("");
    };

    render(
      <ErrorBoundary>
        <ThrowNoMessage />
      </ErrorBoundary>
    );

    expect(screen.getByText("An unexpected error occurred")).toBeInTheDocument();
  });
});
