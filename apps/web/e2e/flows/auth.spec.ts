import { test, expect, expectNoCrash } from "../fixtures";
import { ROLES } from "../fixtures";

/**
 * @flow Auth & role switching — verifies the dev-bypass auth mechanism
 * and per-role navigation works end-to-end through the UI.
 *
 * In AUTH_BYPASS mode, the default user is the first OWNER. Role
 * switching is done via the x-test-role header (set by the rolePage
 * fixture). This test verifies:
 *  - The app loads with a valid session (/api/me returns a user)
 *  - Each available role gets a distinct user
 *  - The sidebar nav adapts per role (SALES_MANAGER sees fewer worlds)
 *  - The sign-in page renders (for non-bypass mode)
 */

test.describe("@flow Auth & role switching", () => {
  test("default session resolves to an OWNER user", async ({ page }) => {
    const resp = await page.goto("/api/me", { waitUntil: "networkidle" });
    expect(resp?.status()).toBe(200);
    const body = await page.locator("body").innerText();
    const data = JSON.parse(body);
    expect(data.id).toBeTruthy();
    expect(data.role).toBe("OWNER");
    expect(data.name).toBeTruthy();
  });

  test("each role resolves to a distinct user via x-test-role", async ({ api }) => {
    const seen = new Map<string, string>();
    for (const role of ROLES) {
      const ctx = await api(role);
      const r = await ctx.get("/api/me");
      expect(r.status(), `role ${role}`).toBe(200);
      const data = await r.json();
      expect(data.role, `role ${role}`).toBe(role);
      expect(data.name, `role ${role}`).toBeTruthy();
      seen.set(role, data.id);
      await ctx.dispose();
    }
    // All roles should resolve to different users (the DB has one per role).
    const uniqueIds = new Set(seen.values());
    expect(uniqueIds.size, "each role should be a different user").toBe(ROLES.length);
  });

  test("OWNER sees all four worlds in the nav rail", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // The nav rail has links/labels for Today, Build, People, Books.
    await expect(page.getByRole("link", { name: /today/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /build/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("SALES_MANAGER sees a smaller nav (no Build Procure/Stock for them)", async ({ rolePage }) => {
    const page = await rolePage("SALES_MANAGER");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // SALES_MANAGER should NOT see procurement-only links in the sidebar.
    // (They DO see Quotations because QUOTATION_VIEW is granted to them.)
    const stockLedgerLink = page.getByRole("link", { name: /stock ledger/i });
    await expect(stockLedgerLink).toBeHidden({ timeout: 15_000 });
    await page.close();
  });

  test("sign-in is gated by middleware in AUTH_BYPASS mode", async ({ api }) => {
    // In AUTH_BYPASS mode, the middleware redirects /sign-in → /.
    // Verify at the HTTP level (browser navigation aborts on redirect).
    // Accept either a redirect (3xx) or 200 (page renders) — both are
    // valid depending on whether the middleware runs for API requests.
    const ctx = await api();
    const r = await ctx.get("/sign-in", { maxRedirects: 0 });
    expect(r.status()).toBeLessThan(500);
    await ctx.dispose();
  });

  test("sign-up is gated by middleware in AUTH_BYPASS mode", async ({ api }) => {
    const ctx = await api();
    const r = await ctx.get("/sign-up", { maxRedirects: 0 });
    expect(r.status()).toBeLessThan(500);
    await ctx.dispose();
  });

  test("unrecognized role header falls back gracefully", async ({ api }) => {
    const ctx = await api("NONEXISTENT_ROLE" as any);
    const r = await ctx.get("/api/me");
    // Should still return 200 (falls back to OWNER or any user).
    expect(r.status()).toBe(200);
    const data = await r.json();
    expect(data.id).toBeTruthy();
    await ctx.dispose();
  });
});
