import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../I18nProvider";

function FormatDateProbe({ options }: { options?: Intl.DateTimeFormatOptions }) {
  const { formatDate } = useI18n();
  return <div data-testid="formatted">{formatDate(new Date("2026-09-17T10:30:00Z"), options)}</div>;
}

describe("I18nProvider formatDate", () => {
  it("formats date-only without options", () => {
    render(
      <I18nProvider>
        <FormatDateProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId("formatted").textContent).not.toBe("");
  });

  it("does not throw when combining dateStyle and timeStyle", () => {
    render(
      <I18nProvider>
        <FormatDateProbe options={{ dateStyle: "medium", timeStyle: "short" }} />
      </I18nProvider>
    );
    expect(screen.getByTestId("formatted").textContent).not.toBe("");
  });
});
