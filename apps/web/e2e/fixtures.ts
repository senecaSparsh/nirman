import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════
 * E2E TEST FIXTURES — auth, role switching, navigation helpers
 * ═══════════════════════════════════════════════════════════════════
 *
 * The app runs with AUTH_BYPASS=true (dev mode). The default user is
 * the first OWNER in the DB. To test other roles, we set the
 * `x-test-role` header on every request (document + XHR/fetch), which
 * `getDevBypassUser()` in src/lib/server.ts reads to pick a user with
 * that role.
 *
 * Available roles in the dev DB: OWNER, ADMIN, ACCOUNTANT,
 * PROJECT_MANAGER, SALES_MANAGER, SUPERVISOR.
 */

export const ROLES = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "PROJECT_MANAGER",
  "SALES_MANAGER",
  "SUPERVISOR",
] as const;
export type Role = (typeof ROLES)[number];

/** The default role for tests that don't care about RBAC. */
export const DEFAULT_ROLE: Role = "OWNER";

type Fixtures = {
  /** A page with the x-test-role header set to the given role. */
  rolePage: (role: Role) => Promise<Page>;
  /** API request context with role header set. */
  api: (role?: Role) => Promise<APIRequestContext>;
};

export const test = base.extend<Fixtures>({
  rolePage: async ({ browser }, use) => {
    const make = async (role: Role) => {
      const ctx = await browser.newContext({
        extraHTTPHeaders: { "x-test-role": role },
      });
      const page = await ctx.newPage();
      return page;
    };
    await use(make);
  },
  api: async ({ playwright }, use) => {
    const make = (role?: Role) => {
      const headers: Record<string, string> = {};
      if (role) headers["x-test-role"] = role;
      return playwright.request.newContext({
        baseURL: `http://localhost:3100`,
        extraHTTPHeaders: headers,
      });
    };
    await use(make);
  },
});

export { expect };

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Navigate to a page and wait for it to settle:
 *  - network idle (SWR fetches complete)
 *  - no loading spinner visible
 */
export async function gotoPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  // Dismiss any toast that might cover buttons.
  await page.locator("[data-sonner-toast]").waitFor({ state: "detached" }).catch(() => {});
}

/** Wait for SWR data to load — polls until no skeleton/loading text. */
export async function waitForData(page: Page) {
  // Wait for any "Loading…" text to disappear.
  await expect(page.getByText(/Loading/i).first()).toBeHidden().catch(() => {});
  // Give SWR a moment to render.
  await page.waitForLoadState("networkidle");
}

/** Assert the page rendered without a crash (no error boundary). */
export async function expectNoCrash(page: Page) {
  // The global error boundary shows "Something went wrong".
  await expect(page.getByText(/something went wrong/i)).toBeHidden().catch(() => {});
  // Next.js dev error overlay.
  await expect(page.locator("nextjs-portal")).toBeHidden().catch(() => {});
}

/** Assert the page shows the NoAccess component for a restricted role. */
export async function expectNoAccess(page: Page, what?: string) {
  if (what) {
    await expect(page.getByText(new RegExp(what, "i")).first()).toBeVisible();
  }
  await expect(page.getByText(/isn.t part of your role/i)).toBeVisible();
}

/** Click a button/link by its accessible name and wait for navigation. */
export async function clickAction(page: Page, name: string | RegExp) {
  await page.getByRole("link", { name }).first().click().catch(async () => {
    await page.getByRole("button", { name }).first().click();
  });
  await page.waitForLoadState("networkidle");
}

/** Fill a labeled field in a dialog/form. */
export async function fillField(page: Page, label: string | RegExp, value: string) {
  const field = page.getByLabel(label);
  await field.first().fill(value);
}

/** Open a dialog by clicking a button, then wait for the dialog to appear. */
export async function openDialog(page: Page, triggerName: string | RegExp) {
  await page.getByRole("button", { name: triggerName }).first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
}

/** Submit a form/dialog by clicking the submit button. */
export async function submitDialog(page: Page, buttonName: string | RegExp = /save|create|submit|add/i) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: buttonName }).first().click();
  await dialog.waitFor({ state: "detached" }).catch(() => {});
  await page.waitForLoadState("networkidle");
}

/** Dismiss a dialog by clicking Cancel / Close. */
export async function cancelDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /cancel|close/i }).first().click();
  await dialog.waitFor({ state: "detached" }).catch(() => {});
}
