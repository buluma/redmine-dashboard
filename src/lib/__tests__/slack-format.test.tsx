import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { renderSlackMarkdown, emojiForShortcode } from "@/src/lib/slack-format";

function html(nodes: React.ReactNode) {
  const { container } = render(<div>{nodes}</div>);
  return container.firstChild as HTMLElement;
}

describe("emojiForShortcode", () => {
  it("maps known shortcodes to glyphs", () => {
    expect(emojiForShortcode("pencil2")).toBe("✏️");
    expect(emojiForShortcode("white_check_mark")).toBe("✅");
  });
  it("returns null for unknown", () => {
    expect(emojiForShortcode("definitely_not_an_emoji")).toBeNull();
  });
});

describe("renderSlackMarkdown", () => {
  it("replaces known emoji shortcodes with glyphs and leaves unknown ones literal", () => {
    const el = html(renderSlackMarkdown(":pencil2: hi :bogus_code:"));
    expect(el.textContent).toBe("✏️ hi :bogus_code:");
  });

  it("renders *bold* as <strong> and _italic_ as <em>", () => {
    const el = html(renderSlackMarkdown("*Status*: _open_"));
    expect(el.querySelector("strong")?.textContent).toBe("Status");
    expect(el.querySelector("em")?.textContent).toBe("open");
  });

  it("renders <url|label> as a link showing the label, not the raw syntax", () => {
    const el = html(renderSlackMarkdown("see <https://redmine.example.com/issues/1|View in Redmine>"));
    const a = el.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://redmine.example.com/issues/1");
    expect(a?.textContent).toBe("View in Redmine");
    expect(el.textContent).not.toContain("|");
    expect(el.textContent).not.toContain("<https");
  });

  it("renders a bare <url> as a link to itself", () => {
    const el = html(renderSlackMarkdown("<https://example.com>"));
    expect(el.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });

  it("resolves <@U123> mentions to display names", () => {
    const el = html(renderSlackMarkdown("hey <@U123>", { U123: "Alice" }));
    expect(el.textContent).toBe("hey @Alice");
  });

  it("renders <@U123|label> and <#C1|general> without the id", () => {
    const el = html(renderSlackMarkdown("<@U9|Bob> in <#C1|general>"));
    expect(el.textContent).toBe("@Bob in #general");
  });

  it("renders <!here> as @here", () => {
    const el = html(renderSlackMarkdown("<!here> heads up"));
    expect(el.textContent).toBe("@here heads up");
  });

  it("decodes Slack HTML entities", () => {
    const el = html(renderSlackMarkdown("a &amp; b &lt; c"));
    expect(el.textContent).toBe("a & b < c");
  });

  it("handles a realistic Reddie bot line end to end", () => {
    const line =
      ":pencil2: Issue #113554 *Progress*: 0 → 50 [Streamline] · :clipboard: Feedback · <https://redmine.nasctech.com/issues/113554|View in Redmine>";
    const el = html(renderSlackMarkdown(line));
    expect(el.textContent).toContain("✏️");
    expect(el.textContent).toContain("📋");
    expect(el.querySelector("strong")?.textContent).toBe("Progress");
    expect(el.querySelector("a")?.textContent).toBe("View in Redmine");
    expect(el.textContent).not.toContain(":pencil2:");
    expect(el.textContent).not.toContain("*Progress*");
  });

  it("returns nothing for empty input", () => {
    expect(renderSlackMarkdown("")).toEqual([]);
  });
});
