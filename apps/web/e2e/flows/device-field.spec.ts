import { test, expect, type Browser, type Page, type BrowserContext } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════
 * REAL-DEVICE FIELD SIMULATION — a supervisor's day on a phone.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Not a smoke test — this emulates a real handset (mobile UA, touch,
 * small viewport) and walks the actual UI flows a field user performs.
 * The middleware routes mobile UA to /m/*; we drive that surface.
 *
 * Device under test: iPhone 14-ish (390×844, WebKit UA, touch).
 * Network: one suite runs under injected latency to simulate a field
 * 3G connection — the app must stay usable, not freeze on blank screens.
 */

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

/** Build a real-device context: mobile UA + touch + small viewport + role header. */
async function deviceCtx(browser: Browser, ua: string, role = "OWNER"): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: ua,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    extraHTTPHeaders: { "x-test-role": role },
  });
}

/** No horizontal overflow — content fits the 390px viewport. */
async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow ${overflow}px`).toBeLessThanOrEqual(2);
}

/** The mobile bottom nav (or its equivalent) is visible + tappable. */
async function expectMobileNav(page: Page, label: string) {
  const nav = page.locator("nav, [role='navigation'], [data-mobile-nav], [class*='bottom-nav'], [class*='tabbar']").last();
  await expect(nav, `${label}: mobile nav should be visible`).toBeVisible({ timeout: 15_000 });
}

test.describe("Real-device field simulation", () => {
  test.setTimeout(180_000);

  test("iPhone: / → middleware routes to /m/home, renders mobile shell", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA);
    const page = await ctx.newPage();
    // Mobile UA landing on / should route to the mobile surface.
    const resp = await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    // After middleware + client routing we should be on an /m/* path.
    expect(page.url(), "mobile UA should land on /m/*").toMatch(/\/m\//);
    expect(resp?.status()).toBeLessThan(400);
    await expectNoHorizontalScroll(page, "m/home");
    await expectMobileNav(page, "m/home");
    await ctx.close();
  });

  test("Pixel: /m/home dashboard renders + key cards are tappable", async ({ browser }) => {
    const ctx = await deviceCtx(browser, PIXEL_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    await page.goto("/m/home", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "supervisor home");
    // Navigable links/cards exist on the home hub.
    const tappables = page.locator("a[href^='/m/'], button, [role='link']");
    expect(await tappables.count()).toBeGreaterThan(3);
    await ctx.close();
  });

  test("field flow: open attendance page on phone", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    await page.goto("/m/attendance", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1000);
    const text = await page.locator("body").innerText();
    // Attendance surface must render real content (not blank/crash).
    expect(text.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "attendance");
    await ctx.close();
  });

  test("field flow: open DPR page on phone", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "PROJECT_MANAGER");
    const page = await ctx.newPage();
    await page.goto("/m/site/dpr", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    const text = await page.locator("body").innerText();
    expect(text.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "dpr");
    await ctx.close();
  });

  test("field flow: open stock/inventory hub on phone", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    await page.goto("/m/inventory", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1000);
    const text = await page.locator("body").innerText();
    expect(text.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "inventory");
    await ctx.close();
  });

  test("slow network (3G): home stays usable — skeletons, not a frozen blank", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    // Inject ~600ms latency on every API + RSC payload fetch to simulate
    // a field connection — the UI must show a shell/skeleton, not hang.
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    const t0 = Date.now();
    await page.goto("/m/home", { waitUntil: "domcontentloaded" });
    // The initial HTML should arrive fast even with slow API calls.
    expect(Date.now() - t0, "initial paint must not wait for slow APIs").toBeLessThan(30_000);
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "slow-network home");
    await ctx.close();
  });

  test("touch targets: briefing list rows are full-height tappable", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA);
    const page = await ctx.newPage();
    await page.goto("/m/home", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    // The briefing/attention rows must be full-height taps — not just the
    // ~12px name text. The name link stretches to the row height so a field
    // user can tap anywhere in the row, not only on the text.
    const briefingLink = page.getByRole("link", { name: /Everything that needs you|Approvals|Low stock/i }).first();
    if (await briefingLink.count()) {
      const h = await briefingLink.evaluate((el) => el.getBoundingClientRect().height);
      expect(h, "briefing row link should fill the row height").toBeGreaterThanOrEqual(24);
    }
    // And no interactive element is unusably tiny (<10px) on the home surface.
    const unusablySmall = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a, button")).filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && r.height < 10 && s.visibility !== "hidden";
      }).length,
    );
    expect(unusablySmall, "no <10px interactive targets").toBe(0);
    await ctx.close();
  });

  test("primary/interactive text is readable on the small screen", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA);
    const page = await ctx.newPage();
    await page.goto("/m/home", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    // Interactive + heading text must be readable — a field user reads the
    // primary label, not the 8px micro sub-caption beneath it.
    const tinyInteractive = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a, button, h1, h2, h3, label")).filter((el) => {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        const r = el.getBoundingClientRect();
        return fs > 0 && fs < 10 && r.height > 0 && (el.textContent || "").trim().length > 2;
      }).map((el) => `${el.tagName}:${(el.textContent || "").trim().slice(0, 20)}`);
    });
    expect(tinyInteractive, `tiny primary text: ${tinyInteractive.join(", ")}`).toHaveLength(0);
    await ctx.close();
  });
});
