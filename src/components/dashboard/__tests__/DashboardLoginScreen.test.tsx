import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DashboardLoginScreen } from "@/src/components/dashboard/DashboardLoginScreen";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (!vars) return key;
      return `${key}:${Object.values(vars).join(",")}`;
    },
  }),
}));

function renderScreen(overrides: Partial<Parameters<typeof DashboardLoginScreen>[0]> = {}) {
  const props = {
    baseUrl: "",
    apiKey: "",
    onBaseUrlChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    loading: false,
    bootstrapInfo: null,
    bootstrapBusy: false,
    onBootstrapFromEnv: vi.fn(),
    error: null,
    ...overrides,
  };
  render(<DashboardLoginScreen {...props} />);
  return props;
}

describe("DashboardLoginScreen", () => {
  it("submits base URL and API key via the form", () => {
    const props = renderScreen({ baseUrl: "https://redmine.example.com", apiKey: "secret" });
    fireEvent.submit(screen.getByRole("button", { name: "login.launchDashboard" }).closest("form")!);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls onBaseUrlChange/onApiKeyChange as the user types", () => {
    const props = renderScreen();
    fireEvent.change(screen.getByPlaceholderText("login.baseUrlPlaceholder"), {
      target: { value: "https://redmine.example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("login.apiKeyPlaceholder"), {
      target: { value: "abc123" },
    });
    expect(props.onBaseUrlChange).toHaveBeenCalledWith("https://redmine.example.com");
    expect(props.onApiKeyChange).toHaveBeenCalledWith("abc123");
  });

  it("shows the connecting label and disables submit while loading", () => {
    renderScreen({ loading: true });
    const button = screen.getByRole("button", { name: "login.connecting" });
    expect(button).toBeDisabled();
  });

  it("shows the env-bootstrap button only when configured", () => {
    renderScreen({ bootstrapInfo: null });
    expect(screen.queryByText("login.useEnvConfig")).toBeNull();

    renderScreen({ bootstrapInfo: { configured: true, canBootstrap: true, activeCredentials: 1 } });
    expect(screen.getByText("login.useEnvConfig")).toBeInTheDocument();
  });

  it("disables the env-bootstrap button and shows help text when canBootstrap is false", () => {
    renderScreen({
      bootstrapInfo: { configured: true, canBootstrap: false, activeCredentials: 3 },
    });
    expect(screen.getByText("login.useEnvConfig")).toBeDisabled();
    expect(screen.getByText(/login.envBootstrapHelp/)).toBeInTheDocument();
  });

  it("calls onBootstrapFromEnv when the env-bootstrap button is clicked", () => {
    const props = renderScreen({
      bootstrapInfo: { configured: true, canBootstrap: true, activeCredentials: 1 },
    });
    fireEvent.click(screen.getByText("login.useEnvConfig"));
    expect(props.onBootstrapFromEnv).toHaveBeenCalledTimes(1);
  });

  it("renders an error banner when error is set", () => {
    renderScreen({ error: "Invalid Redmine credentials" });
    expect(screen.getByText("Invalid Redmine credentials")).toBeInTheDocument();
  });

  it("renders no error banner when error is null", () => {
    renderScreen({ error: null });
    expect(screen.queryByText(/error-banner/)).toBeNull();
  });
});
