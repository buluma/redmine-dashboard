import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "@/src/components/ThemeToggle";
import { ThemeProvider } from "@/src/components/ThemeProvider";

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

const matchMediaMock = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
Object.defineProperty(window, "matchMedia", { value: matchMediaMock, writable: true });

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "theme.system": "System Default",
        "theme.light": "Light",
        "theme.dark": "Dark",
      };
      return map[key] ?? key;
    },
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeToggle (expanded)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("renders a select with three options", () => {
    render(<ThemeToggle />, { wrapper: Wrapper });

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("System Default")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("defaults to system mode", () => {
    render(<ThemeToggle />, { wrapper: Wrapper });

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("system");
  });

  it("initializes from localStorage", () => {
    localStorageMock.getItem.mockReturnValue("dark");

    render(<ThemeToggle />, { wrapper: Wrapper });

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("dark");
  });

  it("changes theme when select changes", () => {
    render(<ThemeToggle />, { wrapper: Wrapper });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "light" } });

    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "light");
  });

  it("shows system icon in system mode", () => {
    render(<ThemeToggle />, { wrapper: Wrapper });

    expect(screen.getByText("◑")).toBeInTheDocument();
  });
});

describe("ThemeToggle (collapsed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("renders a button when collapsed", () => {
    render(<ThemeToggle collapsed />, { wrapper: Wrapper });

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("cycles system → light on first click", () => {
    render(<ThemeToggle collapsed />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "light");
  });

  it("cycles light → dark on second click", () => {
    localStorageMock.getItem.mockReturnValue("light");

    render(<ThemeToggle collapsed />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "dark");
  });

  it("cycles dark → system on third click", () => {
    localStorageMock.getItem.mockReturnValue("dark");

    render(<ThemeToggle collapsed />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "system");
  });
});
