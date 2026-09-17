/* eslint-disable no-console */
// Visual audit: sign in per role, screenshot key surfaces incl. the dept FAB fan.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/visual-audit";
fs.mkdirSync(OUT, { recursive: true });

const FLOWS = [
  {
    role: "OWNER",
    shots: [
      { go: "/m/home", snap: "01-home" },
      { go: "/m/home", snap: "02-fan-open", click: 'button[aria-label="More departments"]', wait: 700 },
      { go: "/m/home", snap: "03-navsheet", click: 'button[aria-label="Open menu"]', wait: 600 },
      { go: "/m/approvals", snap: "04-approvals" },
      { go: "/m/inventory", snap: "05-inventory" },
      { go: "/m/stock", snap: "06-stock" },
      { go: "/m/materials", snap: "07-materials" },
      { go: "/m/hr", snap: "08-hr" },
      { go: "/m/accounts", snap: "09-accounts" },
      { go: "/m/settings", snap: "10-settings" },
      { go: "/m/me", snap: "11-me" },
      { go: "/m/reports", snap: "12-reports" },
    ],
  },
  {
    role: "SITE_ENGINEER",
    shots: [
      { go: "/m/home", snap: "20-se-home" },
      { go: "/m/home", snap: "21-se-fan", click: 'button[aria-label="More departments"]', wait: 700 },
      { go: "/m/site", snap: "22-se-site" },
      { go: "/m/attendance", snap: "23-se-attendance" },
    ],
  },
];

const browser = await chromium.launch();
const errs = [];

for (const flow of FLOWS) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errs.push(`${flow.role} ${page.url()}: ${String(e).slice(0, 160)}`));

  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000); // dev compile settle
  const creds = await page.evaluate(async (role) => {
    const res = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    return res.json();
  }, flow.role);

  if (!creds.email) {
    console.log(`${flow.role}: demo-login FAILED`, creds);
    await ctx.close();
    continue;
  }

  await page.getByRole("button", { name: /^Email$/ }).first().click();
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 45000 });
  console.log(`${flow.role}: signed in -> ${page.url()}`);

  for (const s of flow.shots) {
    try {
      await page.goto(`${BASE}${s.go}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1400); // let client data settle
      if (s.click) {
        await page.locator(s.click).first().click({ timeout: 5000 });
        await page.waitForTimeout(s.wait ?? 500);
      }
      await page.screenshot({ path: `${OUT}/${flow.role}-${s.snap}.png` });
      console.log(`  ${s.snap} ok`);
    } catch (e) {
      console.log(`  ${s.snap} FAILED: ${String(e).slice(0, 120)}`);
      await page.screenshot({ path: `${OUT}/${flow.role}-${s.snap}-err.png` }).catch(() => {});
    }
  }
  await ctx.close();
}

await browser.close();
if (errs.length) {
  console.log("\nPAGE ERRORS:");
  errs.forEach((e) => console.log("  " + e));
}
console.log("done");
