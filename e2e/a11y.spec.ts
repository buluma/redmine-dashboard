import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

/**
 * Accessibility regression gate.
 *
 * Scans key public-facing pages with axe-core. Fails the run on any
 * serious/critical violation. WCAG 2 A + AA tags only — color-contrast
 * disabled because dynamic theme values vary by token at runtime and
 * are best vetted by hand.
 */
const TARGETS = [
  { name: "Dashboard / home", path: "/" },
  { name: "Login page", path: "/login" },
];

for (const target of TARGETS) {
  test(`a11y: ${target.name} has no serious or critical violations`, async ({ page }) => {
    await page.goto(`${BASE_URL}${target.path}`);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length > 0) {
      // Print a compact summary so CI logs surface the offenders.
      // eslint-disable-next-line no-console
      console.log(
        blocking
          .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.helpUrl}`)
          .join("\n"),
      );
    }

    expect(blocking).toEqual([]);
  });
}
