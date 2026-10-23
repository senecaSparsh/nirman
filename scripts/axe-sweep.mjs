// Axe sweep — warms each route then runs axe-core in one browser session.
// Usage: node scripts/axe-sweep.mjs [routes...]
// Defaults to the mobile detail-route family.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const AXE = readFileSync(
  "node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core/axe.min.js",
  "utf8",
);

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/m/rentals", "/m/accounts", "/m/gate-pass", "/m/wbs", "/m/boq",
      "/m/units", "/m/customers", "/m/supplier-payments", "/m/expense-claims",
      "/m/standard-consumptions", "/m/portal-listings", "/m/budget-variance",
      "/m/me", "/m/site", "/m/inventory",
    ];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Sign in like a real user. demo-login is disabled in production
// builds — fall back to the seeded OWNER credentials in that case.
let email = process.env.SWEEP_EMAIL, password = process.env.SWEEP_PASSWORD;
if (!email) {
  const creds = await page.request.post(`${BASE}/api/auth/demo-login`, {
    data: { role: "OWNER" },
  });
  if (creds.ok()) ({ email, password } = await creds.json());
}
if (!email) { email = "phone+917017988293@nirman.internal"; password = "nirman123"; }
const signin = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email, password },
});
if (!signin.ok()) throw new Error("sign-in failed: " + (await signin.text()));
// land once so the session cookie is stored in the context
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => {});

for (const route of routes) {
  try {
    // warm compile (server-side) then real navigation
    await page.request.get(`${BASE}${route}`, { timeout: 180_000 }).catch(() => {});
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(2500);
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(() =>
      window.axe.run(document, { resultTypes: ["violations"] }).then((r) => ({
        url: location.href,
        count: r.violations.length,
        ids: r.violations.map((v) => v.id),
        nodes: r.violations.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 110) + " | " + JSON.stringify(n.any?.[0]?.data ?? {}))),
      })),
    );
    if (res.count === 0) console.log(`✅ ${route} → 0 violations (${res.url})`);
    else {
      console.log(`❌ ${route} → ${res.count} violations (${res.url}) [${(res.ids||[]).join(",")}]`);
      for (const n of res.nodes) console.log(`   ${n}`);
    }
  } catch (e) {
    console.log(`⚠️  ${route} → ${String(e.message ?? e).slice(0, 110)}`);
  }
}
await browser.close();
