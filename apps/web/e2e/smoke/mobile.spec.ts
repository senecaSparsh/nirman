import { test, expect, expectNoCrash } from "../fixtures";
import { MOBILE_PAGES } from "../helpers/pages";

/**
 * Mobile smoke tests — every non-dynamic /m/ page loads without a
 * crash as OWNER. Mobile pages use a different shell (bottom nav,
 * no desktop sidebar rail) so we only assert no-crash + content.
 *
 * We emulate a mobile viewport so any responsive logic triggers.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

// Mobile report pages do heavy DB queries + cold Turbopack compilation
// in dev, so they need a longer timeout. We also use domcontentloaded
// (not networkidle) because SWR revalidation keeps the network busy.
test.describe("Mobile smoke — all /m pages load (OWNER)", () => {
  test.setTimeout(90_000);
  for (const entry of MOBILE_PAGES) {
    if (entry.skip) continue;
    test(`${entry.path} loads without error`, async ({ page }) => {
      const resp = await page.goto(entry.path, { waitUntil: "domcontentloaded", timeout: 80_000 });
      expect(resp?.status(), `HTTP status for ${entry.path}`).toBeLessThan(500);
      await expectNoCrash(page);
      // Wait for either NoAccess (permission gate) or real content.
      const noAccess = page.getByText(/isn.t part of your role/i).first();
      const body = page.locator("body");
      await Promise.race([
        noAccess.waitFor({ state: "visible", timeout: 60_000 }),
        body.waitFor({ state: "attached" }),
      ]);
      await page.waitForTimeout(500); // let content render
      const hasNoAccess = await noAccess.isVisible().catch(() => false);
      if (hasNoAccess) return; // NoAccess is a valid outcome (permission gate)
      const bodyText = (await body.innerText().catch(() => "")).trim();
      expect(bodyText.length, `${entry.path} body should not be blank`).toBeGreaterThan(0);
    });
  }
});
