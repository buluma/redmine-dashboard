import { describe, expect, it } from "vitest";
import { normalizeRedmineText } from "@/src/lib/redmine-text-format";

describe("normalizeRedmineText", () => {
  it("converts textile headings and links", () => {
    const input = `h2. Release notes\nSee "docs":https://example.com/docs`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("## Release notes");
    expect(output).toContain("[docs](https://example.com/docs)");
  });

  it("converts collapse macros to quote blocks", () => {
    const input = `{{collapse(Why)\nLine one\nLine two\n}}`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("> **Why**");
    expect(output).toContain("> Line one");
    expect(output).toContain("> Line two");
  });

  it("removes toc macro and notextile tags", () => {
    const input = `{{toc}}\n<notextile>@raw@</notextile>`;
    const output = normalizeRedmineText(input);

    expect(output).not.toContain("{{toc}}");
    expect(output).not.toContain("<notextile>");
    expect(output).toContain("`raw`");
  });

  it("converts textile inline code and images", () => {
    const input = `Call @run-now@ and see !https://example.com/img.png!`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("`run-now`");
    expect(output).toContain("![](https://example.com/img.png)");
  });
});
