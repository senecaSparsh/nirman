/* eslint-disable no-console */
// Mobile role flow test: real UI sign-in per role, then exercise the
// most-used mobile systems — home, attendance, site tasks, approvals,
// expenses, pulse. Screenshots + console errors per step.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/role-flow";
fs.mkdirSync(OUT, { recursive: true });
const report = [];

const FLOWS = [
  {
    role: "SITE_ENGINEER",
    steps: [
      { go: "/m/home", snap: "home" },
      { go: "/m/attendance", snap: "attendance", tryClick: ["Check in now"] },
      { go: "/m/site/tasks", snap: "tasks" },
      { go: "/m/dprs", snap: "dprs" },
      { go: "/m/me", snap: "me" },
    ],
  },
  {
    role: "FINANCE_HEAD",
    steps: [
      { go: "/m/home", snap: "home" },
      { go: "/m/expenses", snap: "expenses" },
      { go: "/m/books/finance", snap: "books" },
      { go: "/m/approvals", snap: "approvals" },
      { go: "/m/reports/expenses", snap: "report-expenses" },
    ],
  },
  {
    role: "PROCUREMENT_MANAGER",
    steps: [
      { go: "/m/home", snap: "home" },
      { go: "/m/procurement", snap: "procurement" },
      { go: "/m/materials", snap: "materials" },
      { go: "/m/requisitions", snap: "requisitions" },
      { go: "/m/approvals", snap: "approvals" },
    ],
  },
  {
    role: "OWNER",
    steps: [
      { go: "/m/home", snap: "home" },
      { go: "/m/approvals", snap: "approvals" },
      { go: "/m/pulse", snap: "pulse" },
      { go: "/m/hr", snap: "hr" },
      { go: "/m/settings", snap: "settings" },
      { go: "/m/projects", snap: "projects" },
    ],
  },
];

const browser = await chromium.launch();

for (const flow of FLOWS) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(90000);

  const consoleErrs = [];
  page.on("pageerror", (e) => consoleErrs.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

  // 1. Provision credentials via demo-login (needs a page context for fetch)
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  const creds = await page.evaluate(async (role) => {
    const res = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    return res.json();
  }, flow.role);

  if (!creds.email) {
    report.push({ role: flow.role, step: "demo-login", ok: false, err: JSON.stringify(creds) });
    console.log(`${flow.role}: demo-login FAILED`, creds);
    await ctx.close();
    continue;
  }

  // 2. Real UI sign-in — Email mode, fill the actual form
  await page.getByRole("button", { name: /^Email$/ }).first().click();
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  try {
    await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 45000 });
    report.push({ role: flow.role, step: "sign-in", ok: true });
    console.log(`${flow.role}: signed in -> ${page.url()}`);
  } catch {
    await page.screenshot({ path: `${OUT}/${flow.role}_signin-stuck.png` });
    report.push({ role: flow.role, step: "sign-in", ok: false, err: `stuck at ${page.url()}` });
    console.log(`${flow.role}: sign-in stuck at ${page.url()}`);
    await ctx.close();
    continue;
  }

  // 3. Run the role's flow steps
  for (const step of flow.steps) {
    consoleErrs.length = 0;
    const entry = { role: flow.role, step: step.go, ok: true, clicked: null };
    try {
      const resp = await page.goto(`${BASE}${step.go}`, { waitUntil: "domcontentloaded" });
      entry.status = resp?.status();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${flow.role}_${step.snap}.png` });
      if (entry.status && entry.status !== 200) { entry.ok = false; entry.err = `HTTP ${entry.status}`; }
    } catch (e) {
      entry.ok = false; entry.err = String(e).slice(0, 150);
    }
    if (entry.ok && step.tryClick) {
      for (const label of step.tryClick) {
        const el = page.getByRole("button", { name: new RegExp(label, "i") }).first()
          .or(page.getByRole("link", { name: new RegExp(label, "i") }).first());
        if (await el.count() && await el.isVisible().catch(() => false)) {
          await el.click().catch(() => {});
          await page.waitForTimeout(1500);
          await page.screenshot({ path: `${OUT}/${flow.role}_${step.snap}__clicked.png` });
          entry.clicked = label;
          break;
        }
      }
    }
    if (consoleErrs.length) entry.console = consoleErrs.slice(0, 3);
    report.push(entry);
    console.log(`${flow.role} ${step.go}: ${entry.status ?? "spa"}${entry.clicked ? ` clicked[${entry.clicked}]` : ""}${consoleErrs.length ? ` console:${consoleErrs.length}` : ""}`);
  }
  await ctx.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const fails = report.filter((r) => !r.ok);
console.log(`\nDONE: ${report.length} steps, ${fails.length} failures`);
for (const f of fails) console.log("  FAIL:", f.role, f.step, f.err ?? "");
await browser.close();
