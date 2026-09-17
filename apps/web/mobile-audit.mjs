/* eslint-disable no-console */
// Mobile audit: sign in as OWNER, visit every /m route, screenshot each.
// Standalone playwright instance — does not touch other browser sessions.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/mobile-audit";
const routes = JSON.parse(fs.readFileSync("/tmp/mobile-visitable.json", "utf8"));

// Optional slice: node mobile-audit.mjs <start> <count>
const start = Number(process.argv[2] ?? 0);
const count = Number(process.argv[3] ?? routes.length);
const slice = routes.slice(start, start + count);

fs.mkdirSync(OUT, { recursive: true });
const report = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(90000);

// Hide the Next.js dev-tools overlay (the "N" badge over the Home tab) —
// dev-only chrome that would otherwise pollute every screenshot.
await ctx.addInitScript(() => {
  const hide = () => {
    document
      .querySelectorAll("nextjs-portal, next-route-announcer")
      .forEach((el) => (el.style.display = "none"));
  };
  new MutationObserver(hide).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  hide();
});

const consoleErrs = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrs.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => consoleErrs.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

// ── Sign in ──
await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
const loginStatus = await page.evaluate(async () => {
  const res = await fetch("/api/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "OWNER" }),
  });
  if (!res.ok) return `demo-login ${res.status}`;
  const { email, password } = await res.json();
  const r2 = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return `sign-in ${r2.status}`;
});
console.log("login:", loginStatus);

// ── Visit each route ──
for (const route of slice) {
  const slug = route.replace(/^\//, "").replace(/\//g, "__");
  const idx = routes.indexOf(route);
  consoleErrs.length = 0;
  const t0 = Date.now();
  let status = 0;
  let err = "";
  try {
    let resp;
    try {
      resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    } catch {
      // First hit pays the cold Turbopack compile — retry once on timeout.
      resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    }
    status = resp?.status() ?? 0;
    // Let client data (SWR) settle; wait for the mobile shell to render.
    await page.waitForTimeout(2000);
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
    await page.screenshot({ path: `${OUT}/${String(idx).padStart(3, "0")}_${slug}.png` });
    await page.screenshot({
      path: `${OUT}/${String(idx).padStart(3, "0")}_${slug}__full.png`,
      fullPage: true,
    });
  } catch (e) {
    err = String(e).slice(0, 200);
    try {
      await page.screenshot({ path: `${OUT}/${String(idx).padStart(3, "0")}_${slug}__ERR.png` });
    } catch {}
  }
  const ms = Date.now() - t0;
  report.push({ route, status, ms, err, console: consoleErrs.slice(0, 3) });
  console.log(
    `${String(idx).padStart(3, "0")} ${route}  status=${status} ${ms}ms${err ? " ERR:" + err : ""}${consoleErrs.length ? " console:" + consoleErrs.length : ""}`,
  );
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
}

await browser.close();
console.log("DONE", slice.length, "routes");
