import { test, expect, gotoPage, expectNoCrash } from "../fixtures";
import { DESKTOP_PAGES } from "../helpers/pages";

/**
 * Interactive map walk — beyond "does the page load". One test per route.
 *
 *   1. Load, assert no crash / no error boundary.
 *   2. Tabs: click each tab in the first tablist, assert panel stays healthy.
 *   3. Dialog: click a "New / Add / Create" button, assert a dialog opens,
 *      then Escape — never submit.
 *   4. Search: if a search box is visible, type in it, assert no crash.
 *
 * Nothing is submitted/deleted. Each page is isolated — one bad page
 * doesn't take the rest down.
 */

test.describe("Map walk — interactive surface (OWNER)", () => {
  for (const entry of DESKTOP_PAGES) {
    if (entry.skip) continue;

    test(`${entry.path} interactive`, async ({ page }) => {
      const label = entry.path;
      const resp = await page.goto(entry.path, { waitUntil: "domcontentloaded" });
      expect(resp?.status(), `${label} HTTP`).toBeLessThan(500);
      await page.waitForLoadState("networkidle").catch(() => {});
      await expectNoCrash(page);

      const noAccess = await page.getByText(/isn.t part of your role/i).first().isVisible().catch(() => false);
      test.skip(noAccess, "permission-gated page (NoAccess)");

      // ── Tabs ──────────────────────────────────────────────────────
      const tabs = page.locator("[role=tablist]").first().locator("[role=tab]");
      const tabCount = Math.min(await tabs.count().catch(() => 0), 8);
      for (let i = 0; i < tabCount; i++) {
        const t = tabs.nth(i);
        if (!(await t.isVisible().catch(() => false))) continue;
        if ((await t.getAttribute("aria-selected")) === "true") continue;
        await t.click();
        await page.waitForTimeout(300);
        await expectNoCrash(page);
      }

      // ── Dialog open/close ─────────────────────────────────────────
      const createBtn = page.getByRole("button", { name: /new|add|create|register|book|record/i }).first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
        const dialog = page.locator("[role=dialog]").first();
        if (await dialog.waitFor({ state: "visible", timeout: 2500 }).then(() => true).catch(() => false)) {
          await page.keyboard.press("Escape");
          await expect(dialog, `${label}: dialog should close on Escape`).toBeHidden({ timeout: 2000 });
        }
      }

      // ── Search box ────────────────────────────────────────────────
      const search = page.getByPlaceholder(/search/i).first();
      if (await search.isVisible().catch(() => false)) {
        await search.fill("cement");
        await page.waitForTimeout(400);
        await expectNoCrash(page);
      }

      await expectNoCrash(page);
    });
  }
});
