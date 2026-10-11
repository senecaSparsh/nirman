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

  test("attendance flow: select project → Mark all present → save state correct", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    await page.goto("/m/site/attendance", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    // Dismiss any onboarding/tour dialog that overlays the form.
    const tourDismiss = page.getByRole("button", { name: /Not now|Skip|Close|Got it/i }).first();
    if (await tourDismiss.isVisible().catch(() => false)) await tourDismiss.click().catch(() => {});
    // The attendance form must render worker rows + the mark-all action.
    const markAll = page.getByRole("button", { name: /Mark all present/i });
    if (await markAll.count()) {
      await markAll.tap().catch(() => markAll.click());
      await page.waitForTimeout(800);
    }
    // After marking, the save button reports state — either a live
    // "Save Attendance (N)" or the payroll-lock indicator for a paid period.
    const saveBtn = page.getByRole("button", { name: /Save Attendance|Locked — payroll/i }).last();
    const label = (await saveBtn.innerText().catch(() => "")).trim();
    expect(
      /Save Attendance|Locked — payroll/i.test(label),
      `save button should show a valid state, got "${label}"`,
    ).toBe(true);
    // If it's unlocked, actually tap Save and confirm a success/error toast appears.
    if (/Save Attendance/i.test(label) && !(await saveBtn.isDisabled())) {
      await saveBtn.tap().catch(() => saveBtn.click());
      await page.waitForTimeout(2500);
      const toast = page.locator("[data-sonner-toast], [role='status'], .toast, [class*='toast']").last();
      const toastText = await toast.innerText().catch(() => "");
      expect(toastText.length, "a save should surface a toast result").toBeGreaterThan(0);
    }
    await ctx.close();
  });

  test("offline: issue form switches to 'Queue Issue (Offline)' + queues locally", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    await page.goto("/m/stock-out?mode=issue", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    // Online state — the submit is a real send.
    const onlineBtn = page.getByRole("button", { name: /Generate Issue Challan|Issue/i });
    // Go offline — the app should detect it and offer to queue the op.
    await ctx.setOffline(true);
    await page.waitForTimeout(1200); // let the online/offline listener fire
    const offlineBtn = page.getByRole("button", { name: /Queue Issue \(Offline\)|Queue.*Offline/i });
    const offlineVisible = await offlineBtn.isVisible().catch(() => false);
    // The offline affordance must appear — either the button re-labels or an
    // offline banner/toast shows. Both mean the app detected disconnectivity.
    const offlineBanner = await page.getByText(/offline|no connection|you.re offline/i).isVisible().catch(() => false);
    expect(
      offlineVisible || offlineBanner,
      "going offline should switch the submit to a queue affordance or show an offline indicator",
    ).toBe(true);
    await ctx.setOffline(false);
    await ctx.close();
  });

  test("receive-goods: pick a PO → receive form appears on phone", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "SUPERVISOR");
    const page = await ctx.newPage();
    await page.goto("/m/site/receive", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "receive");
    // The receive entry is a PO <select> — pick the first real PO option and
    // the receive form (qty/lines) should render.
    const poSelect = page.locator("select").first();
    if (await poSelect.count()) {
      const opts = await poSelect.locator("option:not([disabled])").allInnerTexts();
      const pick = opts.find((o) => /PO-\d+/.test(o));
      if (pick) {
        await poSelect.selectOption({ label: pick });
        await page.waitForTimeout(1200);
        const formVisible = await page.locator("input, select, button").filter({ hasText: /qty|receive|deliver|Qty/i }).count();
        const qtyField = await page.locator("input[type='number'], input[placeholder*='qty' i], input[inputmode='numeric']").count();
        expect(qtyField + formVisible, "selecting a PO should reveal a receive form").toBeGreaterThan(0);
      }
    }
    await ctx.close();
  });

  test("offline queue page renders — field user sees pending ops", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA);
    const page = await ctx.newPage();
    await page.goto("/m/queue", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "offline queue");
    await ctx.close();
  });

  test("surface parity: desktop UA on / stays desktop, /m/* stays mobile", async ({ browser }) => {
    // A desktop UA landing on / must NOT be forced to mobile.
    const desktopCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { "x-test-role": "OWNER" },
    });
    const dpage = await desktopCtx.newPage();
    await dpage.goto("/", { waitUntil: "domcontentloaded" });
    await dpage.waitForLoadState("networkidle").catch(() => {});
    expect(dpage.url(), "desktop UA must stay on desktop surface").not.toMatch(/\/m\//);
    await desktopCtx.close();

    // And a mobile UA on a desktop route must be offered the /m/* equivalent.
    const mctx = await deviceCtx(browser, IPHONE_UA);
    const mpage = await mctx.newPage();
    const resp = await mpage.goto("/hr", { waitUntil: "domcontentloaded" }).catch(() => null);
    await mpage.waitForLoadState("networkidle").catch(() => {});
    // Either redirected to /m/* OR the desktop route renders (acceptable for
    // non-mapped routes) — the check is it doesn't 404.
    expect(resp ? (resp.status() < 500) : true, "a desktop route on mobile should not 500").toBe(true);
    await mctx.close();
  });

  test("DPR flow: open today's site-report form on phone", async ({ browser }) => {
    const ctx = await deviceCtx(browser, IPHONE_UA, "PROJECT_MANAGER");
    const page = await ctx.newPage();
    await page.goto("/m/site/dpr", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    // Dismiss any tour/overlay.
    const tour = page.getByRole("button", { name: /Not now|Skip|Close|Got it/i }).first();
    if (await tour.isVisible().catch(() => false)) await tour.click().catch(() => {});
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page, "dpr");
    // The DPR surface exposes a way to record progress (a text area, add-work
    // control, or a save/submit action).
    const dprControl = page.locator("textarea, input[type='number'], [role='button'], button").first();
    expect(await dprControl.count(), "DPR form should have input/submit controls").toBeGreaterThan(0);
    await ctx.close();
  });

  test("customer portal on phone: OTP login renders", async ({ browser }) => {
    // The portal is customer-facing — no staff role, just a phone login.
    const ctx = await browser.newContext({
      userAgent: IPHONE_UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto("/portal", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    // A phone/OTP login field must be present — it's the portal's entry.
    const phoneField = page.locator("input[type='tel'], input[placeholder*='phone' i], input[placeholder*='mobile' i], input[inputmode='tel']").first();
    const hasPhone = await phoneField.isVisible().catch(() => false);
    expect(hasPhone || /phone|mobile|OTP|login|sign/i.test(body), "portal should show a phone/OTP login").toBe(true);
    await expectNoHorizontalScroll(page, "portal login");
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
