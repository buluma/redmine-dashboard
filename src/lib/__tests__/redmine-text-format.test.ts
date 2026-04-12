import { describe, expect, it } from "vitest";
import { normalizeRedmineText, splitRedmineCollapseSegments } from "@/src/lib/redmine-text-format";

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

  it("handles uppercase Collapse macro variants", () => {
    const input = `{{Collapse(Result)\nLine one\n}}`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("> **Result**");
    expect(output).toContain("> Line one");
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

  it("converts styled Redmine attachment images to attachment placeholders", () => {
    const input = `open the rack form\n!{height:924px; width:435px;}20260319-131544-758.png!`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("open the rack form");
    expect(output).toContain("![](/api/issues/_ATTACHMENT_/20260319-131544-758.png)");
    expect(output).not.toContain("!{height");
  });

  it("converts Redmine image references in journal notes to attachment placeholders", () => {
    const input = `Something is broken [Image: 20260403-122619-539.png]\n[Image: 20260403-122538-591.png]`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("![20260403-122619-539.png](/api/issues/_ATTACHMENT_/20260403-122619-539.png)");
    expect(output).toContain("![20260403-122538-591.png](/api/issues/_ATTACHMENT_/20260403-122538-591.png)");
    expect(output).not.toContain("[Image:");
  });

  it("removes Redmine Textile style wrappers while keeping label text", () => {
    const input = `%{background:orange;}Result% • Error\n%{background:lightgreen;}Expected% success message`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("Result • Error");
    expect(output).toContain("Expected success message");
    expect(output).not.toContain("%{background");
  });

  it("converts escaped redmine pre/code blocks into fenced markdown", () => {
    const input = `Condition details...\n&lt;pre&gt;&lt;code class=&quot;javascript&quot;&gt;ctx.instance.isChanged(\"status\") &amp;&amp; ok&lt;/pre&gt;&lt;/code&gt;`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("```javascript");
    expect(output).toContain("ctx.instance.isChanged(\"status\") && ok");
    expect(output).toContain("```");
  });

  it("converts pre-only blocks (including attributes) to fenced markdown", () => {
    const rawInput = `payload:\n<pre class="prettyprint">{\"long\":\"value\"}</pre>`;
    const rawOutput = normalizeRedmineText(rawInput);
    expect(rawOutput).toContain("```");
    expect(rawOutput).toContain("{\"long\":\"value\"}");

    const escapedInput = `payload:\n&lt;pre class=&quot;prettyprint&quot;&gt;{\"long\":\"value\"}&lt;/pre&gt;`;
    const escapedOutput = normalizeRedmineText(escapedInput);
    expect(escapedOutput).toContain("```");
    expect(escapedOutput).toContain("{\"long\":\"value\"}");
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

  it("decodes literal escaped newlines and tabs from Redmine text", () => {
    const input = `SRC #99614\\n\\nLine one\\n\\tLine two`;
    const output = normalizeRedmineText(input);

    expect(output).toContain("SRC #99614\n\nLine one\n\tLine two");
    expect(output).not.toContain("\\n");
  });

  it("splits markdown and collapse segments for UI rendering", () => {
    const input = `Intro text\n{{Collapse(Logs)\n!{width:300px;}clipboard-202602031412-xsdqg.png!\n@echo ok@\n}}\nTail text`;
    const segments = splitRedmineCollapseSegments(input);

    expect(segments.length).toBe(3);
    expect(segments[0]).toEqual({ type: "markdown", content: "Intro text\n" });
    expect(segments[1]).toEqual({
      type: "collapse",
      title: "Logs",
      content: "!{width:300px;}clipboard-202602031412-xsdqg.png!\n@echo ok@",
    });
    expect(segments[2]).toEqual({ type: "markdown", content: "\nTail text" });
  });
});
