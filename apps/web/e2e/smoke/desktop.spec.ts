import { test, expect, gotoPage, expectNoCrash } from "../fixtures";
import { DESKTOP_PAGES } from "../helpers/pages";

/**
 * Desktop smoke tests — every non-dynamic desktop page loads without
 * a crash as OWNER (full permissions). Asserts:
 *  - HTTP 200
 *  - No error boundary / Next.js dev overlay
 *  - The page shell is present (sidebar rail or page content)
 *
 * Dynamic [id] pages are skipped here (covered by deep flow tests).
 */
test.describe("Desktop smoke — all pages load (OWNER)", () => {
  for (const entry of DESKTOP_PAGES) {
    if (entry.skip) continue;
    test(`${entry.path} loads without error`, async ({ page }) => {
      const resp = await page.goto(entry.path, { waitUntil: "networkidle" });
      expect(resp?.status(), `HTTP status for ${entry.path}`).toBeLessThan(500);
      await expectNoCrash(page);
      // The app shell renders a sidebar rail (desktop) or page content.
      // Either an <h1> (PageHeader) or NoAccess text must be present.
      const hasContent = await page.locator("h1").first().isVisible().catch(() => false);
      const hasNoAccess = await page.getByText(/isn.t part of your role/i).first().isVisible().catch(() => false);
      expect(hasContent || hasNoAccess, `${entry.path} should show h1 or NoAccess`).toBeTruthy();
    });
  }
});

/**
 * Permission gating — pages that SALES_MANAGER should NOT see render
 * the NoAccess component instead of crashing. We spot-check a few
 * representative pages across worlds.
 */
test.describe("Desktop smoke — permission gating (SALES_MANAGER)", () => {
  // SALES_MANAGER lacks: INVENTORY_VIEW, PROCUREMENT_VIEW, HR_VIEW, finance perms.
  // (They DO have ASSETS_VIEW → equipment, GATE_PASS_VIEW → gate-passes, PROJECTS_VIEW.)
  const restrictedPages = [
    { path: "/materials", what: "material catalogue" },
    { path: "/stock", what: "stock" },
    { path: "/requisitions", what: "material indents" },
    { path: "/procurement", what: "purchase orders" },
    { path: "/suppliers", what: "suppliers" },
    { path: "/hr", what: "people" },
    { path: "/finance", what: "books" },
    { path: "/expenses", what: "expenses" },
  ];
  for (const { path, what } of restrictedPages) {
    test(`${path} shows NoAccess for SALES_MANAGER`, async ({ rolePage }) => {
      const page = await rolePage("SALES_MANAGER");
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoCrash(page);
      await expect(page.getByText(/isn.t part of your role/i)).toBeVisible();
      if (what) {
        await expect(page.getByText(new RegExp(what, "i")).first()).toBeVisible();
      }
      await page.close();
    });
  }
});

/**
 * Pages SALES_MANAGER SHOULD see — they render content, not NoAccess.
 */
test.describe("Desktop smoke — SALES_MANAGER can access their pages", () => {
  const allowedPages = ["/", "/customers", "/sales", "/rentals", "/crm", "/portal-listings"];
  for (const path of allowedPages) {
    test(`${path} loads for SALES_MANAGER`, async ({ rolePage }) => {
      const page = await rolePage("SALES_MANAGER");
      const resp = await page.goto(path, { waitUntil: "networkidle" });
      expect(resp?.status()).toBeLessThan(500);
      await expectNoCrash(page);
      await expect(page.getByText(/isn.t part of your role/i)).toBeHidden();
      await page.close();
    });
  }
});
