import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ConstellationBackground } from "@/src/components/ConstellationBackground";
import { ThemeProvider } from "@/src/components/ThemeProvider";

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
Object.defineProperty(window, "matchMedia", { value: matchMediaMock, writable: true });

// jsdom intentionally does not implement canvas rendering. These tests cover
// the component's DOM and lifecycle behavior, so a null context is sufficient
// and keeps jsdom from emitting its unimplemented-canvas warning.
const getContextMock = vi
  .spyOn(HTMLCanvasElement.prototype, "getContext")
  .mockReturnValue(null);

afterAll(() => {
  getContextMock.mockRestore();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ConstellationBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false, // prefers-color-scheme: dark = false, prefers-reduced-motion = false
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("renders nothing in light mode — the dots wouldn't read against the light theme", () => {
    localStorageMock.getItem.mockReturnValue("light");
    const { container } = render(<ConstellationBackground />, { wrapper: Wrapper });
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders a decorative, non-interactive canvas in dark mode", () => {
    localStorageMock.getItem.mockReturnValue("dark");
    const { container } = render(<ConstellationBackground />, { wrapper: Wrapper });
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveStyle({ pointerEvents: "none" });
  });

  it("does not throw when unmounted mid-animation", () => {
    localStorageMock.getItem.mockReturnValue("dark");
    const { unmount } = render(<ConstellationBackground />, { wrapper: Wrapper });
    expect(() => unmount()).not.toThrow();
  });
});
