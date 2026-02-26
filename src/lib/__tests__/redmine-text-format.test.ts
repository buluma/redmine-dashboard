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

  it("converts escaped redmine pre/code blocks into fenced markdown", () => {
    const input = `Condition details...\n&lt;pre&gt;&lt;code class=&quot;javascript&quot;&gt;ctx.instance.isChanged(\"status\") &amp;&amp; ok&lt;/pre&gt;&lt;/code&gt;`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("```javascript");
    expect(output).toContain("ctx.instance.isChanged(\"status\") && ok");
    expect(output).toContain("```");
  });

  it("converts SRC refs to clickable source links", () => {
    const input = `[SRC #71243 from redmine.nasctech.com]\n[SRC-JOURNAL #921156]\nhttps://streamline.staging.vodacomsa-battery.nasctech.com/admin/custom/objects/86/rules/db/336/edit?_tab_id=8m0nwg`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("[SRC #71243](https://redmine.nasctech.com/issues/71243)");
    expect(output).toContain("[SRC-JOURNAL #921156](https://redmine.nasctech.com/journals/921156)");
  });

  it("falls back to first URL for SRC-JOURNAL when source host is unavailable", () => {
    const input = `[SRC-JOURNAL #921156]\nhttps://streamline.staging.vodacomsa-battery.nasctech.com/admin/custom/objects/86/rules/db/336/edit?_tab_id=8m0nwg`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("[SRC-JOURNAL #921156](https://streamline.staging.vodacomsa-battery.nasctech.com/admin/custom/objects/86/rules/db/336/edit?_tab_id=8m0nwg)");
  });
});
