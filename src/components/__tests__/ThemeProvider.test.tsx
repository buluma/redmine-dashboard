import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme, ThemeToggle } from "@/src/components/ThemeProvider";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock matchMedia
const matchMediaMock = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
Object.defineProperty(window, "matchMedia", {
  value: matchMediaMock,
  writable: true,
});

// Test component that uses theme context
const ThemeConsumer = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("system")}>Set System</button>
    </div>
  );
};

describe("ThemeProvider component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("provides theme context to children", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
  });

  it("reads initial theme from localStorage", () => {
    localStorageMock.getItem.mockReturnValue("dark");

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
  });

  it("updates theme when setTheme called", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Set Dark"));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "dark");
  });

  it("resolves system theme based on prefers-color-scheme", () => {
    matchMediaMock.mockReturnValue({
      matches: true, // Dark mode
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
  });

  it("applies theme to document element", () => {
    const setAttributeMock = vi.fn();
    const classListToggleMock = vi.fn();
    Object.defineProperty(document.documentElement, "setAttribute", {
      value: setAttributeMock,
      writable: true,
    });
    Object.defineProperty(document.documentElement.classList, "toggle", {
      value: classListToggleMock,
      writable: true,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Set Dark"));

    expect(setAttributeMock).toHaveBeenCalledWith("data-theme", "dark");
    expect(classListToggleMock).toHaveBeenCalledWith("dark", true);
  });

  it("listens for system theme changes when using system theme", () => {
    const addEventListenerMock = vi.fn();
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: addEventListenerMock,
      removeEventListener: vi.fn(),
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(addEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("cleans up event listener on unmount", () => {
    const removeEventListenerMock = vi.fn();
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerMock,
    });

    const { unmount } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    unmount();

    expect(removeEventListenerMock).toHaveBeenCalled();
  });
});

describe("ThemeToggle component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("renders with sun icon in light mode", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    expect(screen.getByText("☀️")).toBeInTheDocument();
  });

  it("renders with moon icon in dark mode", () => {
    localStorageMock.getItem.mockReturnValue("dark");

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    expect(screen.getByText("🌙")).toBeInTheDocument();
  });

  it("cycles through themes when clicked", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const toggle = screen.getByRole("button");

    // First click: system -> light (default system resolves to light in this test)
    fireEvent.click(toggle);
    expect(screen.getByText("☀️")).toBeInTheDocument();

    // Second click: light -> dark
    fireEvent.click(toggle);
    expect(screen.getByText("🌙")).toBeInTheDocument();

    // Third click: dark -> system (resolved to light since matchMedia returns false)
    fireEvent.click(toggle);
    expect(screen.getByText("☀️")).toBeInTheDocument();
  });

  it("shows current theme in title", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("title", "Current: light. Click to switch.");
  });
});
