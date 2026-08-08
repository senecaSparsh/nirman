/**
 * Nirman Inventory — Functional Crawl
 *
 * Logs in as a given role, walks every route from nav.ts, and per route captures:
 *   - HTTP status (4xx/5xx responses)
 *   - Console errors + warnings
 *   - Page errors (uncaught exceptions)
 *   - Whether the page rendered content or showed NoAccess / error / redirect-to-signin
 *   - Screenshot
 *
 * Output: scripts/crawl-report.json + scripts/crawl-shots/<route>.png
 *
 * Usage: node scripts/crawl.mjs [role-email] [password]
 * Defaults: amit@nirman.in / Crawl123!
 */
import { chromium } from "/opt/homebrew/lib/node_modules/@playwright/test/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const EMAIL = process.argv[2] || "amit@nirman.in";
const PASSWORD = process.argv[3] || "Crawl123!";
const SHOT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "crawl-shots");
const REPORT_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "crawl-report.json");

mkdirSync(SHOT_DIR, { recursive: true });

// ── All routes from nav.ts (deduped, excluding "/") ──────────────────────
const ROUTES = [
  "/", "/my-tasks", "/approvals", "/tasks",
  "/procurement", "/requisitions", "/vendors", "/field",
  "/stock-movements", "/stock-counts", "/supplier-returns",
  "/materials", "/equipment",
  "/projects", "/land", "/renovations", "/units",
  "/sales", "/rentals", "/customers", "/material-sales",
  "/hr", "/hr/employees", "/hr/crews", "/hr/attendance", "/hr/dprs", "/hr/leaves", "/hr/payroll",
  "/finance", "/reports/pending-payments", "/reports/expenses", "/gl", "/reports/gst",
  "/reports", "/reports/profit", "/reports/sales-revenue", "/reports/comparative",
  "/reports/inventory-value", "/reports/purchase-trends", "/reports/department-consumption",
  "/reports/stock-movement-summary", "/reports/issue-register", "/reports/purchase-register",
  "/reports/project-progress", "/reports/payroll-expense",
  "/settings", "/settings/project-assignments", "/workflows", "/playground",
  "/m", // mobile surface
];

function safeName(route) {
  return route.replace(/^\//, "").replace(/\//g, "_") || "root";
}

async function crawl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ── Login ────────────────────────────────────────────────────────────
  console.log(`\nLogging in as ${EMAIL}…`);
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  // Check if we're logged in by looking for app shell content (nav panel)
  const bodyText = await page.innerText("body").catch(() => "");
  const isLoggedIn = /My Tasks|Approvals|Today|Materials|Property|People|Money|Insights|Setup/i.test(bodyText) && !/Sign in|Email|Password/i.test(bodyText);
  if (!isLoggedIn) {
    console.error("Login failed — no app content detected.");
    console.error("Page text:", bodyText.substring(0, 300));
    await browser.close();
    process.exit(1);
  }
  // Navigate to home explicitly to start the crawl clean
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  console.log(`Logged in as ${EMAIL}. Starting crawl…`);

  const results = [];

  // ── Walk routes ──────────────────────────────────────────────────────
  for (const route of ROUTES) {
    const consoleMsgs = [];
    const pageErrors = [];
    const httpErrors = [];

    const msgHandler = (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleMsgs.push({ type: msg.type(), text: msg.text().substring(0, 300) });
      }
    };
    const errHandler = (err) => pageErrors.push(err.message.substring(0, 300));
    const respHandler = (resp) => {
      const status = resp.status();
      if (status >= 400) {
        httpErrors.push({ url: resp.url().replace(BASE, ""), status });
      }
    };

    page.on("console", msgHandler);
    page.on("pageerror", errHandler);
    page.on("response", respHandler);

    const result = { route, status: null, title: null, redirected: false, redirectUrl: null, consoleMsgs, pageErrors, httpErrors, hasContent: false, hasNoAccess: false, hasError: false, primaryAction: null, screenshot: null };

    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch((e) => {
        result.status = "TIMEOUT";
        result.hasError = true;
        pageErrors.push(e.message.substring(0, 300));
        return null;
      });

      if (resp) {
        result.status = resp.status();
        const finalUrl = page.url();
        if (new URL(finalUrl).pathname !== route) {
          result.redirected = true;
          result.redirectUrl = new URL(finalUrl).pathname;
        }
      }

      await page.waitForTimeout(1500); // let dynamic content settle

      result.title = await page.title().catch(() => null);
      // Use innerText (visible text only) — textContent includes <script> payloads
      const bodyText = await page.innerText("body").catch(() => "") || "";
      result.hasContent = bodyText.trim().length > 50;
      result.hasNoAccess = /isn't part of your role|doesn't include access to/i.test(bodyText);
      result.hasError = result.hasError || /something went wrong|application error|unexpected error|unhandled runtime error/i.test(bodyText);

      // Detect primary action button (ochre/brand button or first button with "New"/"Add"/"Create")
      const primaryBtn = await page.$('button[class*="brand"], a[class*="brand"], button:has-text("New"), button:has-text("Add"), button:has-text("Create"), a:has-text("New"), a:has-text("Add")').catch(() => null);
      result.primaryAction = primaryBtn ? (await primaryBtn.textContent().catch(() => "") || "").trim().substring(0, 50) : null;

      // Screenshot
      const shotPath = path.join(SHOT_DIR, `${safeName(route)}.png`);
      await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
      result.screenshot = `crawl-shots/${safeName(route)}.png`;

    } catch (e) {
      result.status = result.status || "ERROR";
      result.hasError = true;
      pageErrors.push(e.message.substring(0, 300));
    }

    page.off("console", msgHandler);
    page.off("pageerror", errHandler);
    page.off("response", respHandler);

    results.push(result);

    const flag = result.hasError ? "ERROR" : result.hasNoAccess ? "NOACCESS" : result.redirected ? "REDIR" : result.status === 200 ? "OK" : result.status;
    const errCount = result.pageErrors.length + result.httpErrors.filter((h) => h.status >= 500).length;
    const consoleErrCount = result.consoleMsgs.filter((m) => m.type === "error").length;
    const marker = errCount > 0 ? " <-- ERRORS" : consoleErrCount > 0 ? " <-- console errors" : "";
    console.log(`  [${String(flag).padEnd(8)}] ${route.padEnd(45)} ${errCount}e/${consoleErrCount}c${marker}`);
  }

  await browser.close();

  // ── Summary ──────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === 200 && !r.hasError && !r.hasNoAccess).length;
  const errors = results.filter((r) => r.hasError).length;
  const noAccess = results.filter((r) => r.hasNoAccess).length;
  const redirects = results.filter((r) => r.redirected).length;
  const totalConsoleErrors = results.reduce((s, r) => s + r.consoleMsgs.filter((m) => m.type === "error").length, 0);
  const totalPageErrors = results.reduce((s, r) => s + r.pageErrors.length, 0);
  const totalHttpErrors = results.reduce((s, r) => s + r.httpErrors.length, 0);

  const report = {
    crawledAt: new Date().toISOString(),
    role: EMAIL,
    baseUrl: BASE,
    summary: { total: results.length, ok, errors, noAccess, redirects, totalConsoleErrors, totalPageErrors, totalHttpErrors },
    results,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  Total routes:  ${results.length}`);
  console.log(`  OK (200):      ${ok}`);
  console.log(`  Errors:        ${errors}`);
  console.log(`  No Access:     ${noAccess}`);
  console.log(`  Redirected:    ${redirects}`);
  console.log(`  Console errors: ${totalConsoleErrors}`);
  console.log(`  Page errors:   ${totalPageErrors}`);
  console.log(`  HTTP 4xx/5xx:  ${totalHttpErrors}`);
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Screenshots: ${SHOT_DIR}/`);
}

crawl().catch((e) => { console.error(e); process.exit(1); });
