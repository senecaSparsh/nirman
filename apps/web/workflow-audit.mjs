// Multi-role workflow audit — real end-to-end flows across roles.
import { chromium } from "@playwright/test";
import fs from "fs";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = "/tmp/mobile-workflow";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const findings = [];
const errs = [];
const note = (f) => { findings.push(f); console.log("NOTE:", f); };

const sessions = new Map();
async function session(role) {
  if (sessions.has(role)) return sessions.get(role);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errs.push(`[${role}] PAGEERR ${String(e).slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("MutationObserver") && !m.text().includes("Performance") && !m.text().includes("401"))
      errs.push(`[${role}] CONSOLE ${m.text().slice(0, 160)}`);
  });
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  let creds = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    creds = await page.evaluate(async (r) => {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: r }),
      });
      return { status: res.status, body: await res.json() };
    }, role);
    if (creds.body.email) break;
    if (creds.status === 429) { console.log(`${role}: 429, waiting 35s`); await page.waitForTimeout(35000); continue; }
    break;
  }
  if (!creds?.body?.email) { note(`${role}: login failed`); sessions.set(role, { ctx, page, ok: false }); return sessions.get(role); }
  await page.getByRole("button", { name: /^Email$/ }).first().click();
  await page.locator('input[type="email"]').fill(creds.body.email);
  await page.locator('input[type="password"]').fill(creds.body.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 30000 });
  await page.waitForTimeout(2500);
  for (const sel of ['button:has-text("Not now")', 'button:has-text("Skip")']) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.tap(); await page.waitForTimeout(800); break; }
  }
  sessions.set(role, { ctx, page, ok: true });
  return sessions.get(role);
}
const snap = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

// Pick an option in a SelectorModal bottom sheet. `fieldText` is the visible
// label/value on the closed control; `optionText` searched in the sheet.
async function pick(page, fieldText, optionText) {
  const field = page.locator(`text=${fieldText}`).first();
  if (!(await field.count())) return `no field ${fieldText}`;
  await field.tap();
  await page.waitForTimeout(1000);
  const sheet = page.locator("div.fixed.inset-0").last();
  if (!(await sheet.count())) return `no sheet after ${fieldText}`;
  const search = sheet.locator('input[type="search"]');
  if (await search.count()) {
    await search.fill(optionText);
    await page.waitForTimeout(500);
  }
  const opt = sheet.locator(`button:has-text("${optionText}")`).first();
  if (!(await opt.count())) return `no option ${optionText}`;
  await opt.tap();
  await page.waitForTimeout(700);
  return true;
}

// ═══ WF1: SITE_ENGINEER submits a DPR ═══
console.log("── WF1: DPR lifecycle ──");
const se = await session("SITE_ENGINEER");
if (se.ok) {
  await se.page.goto(`${BASE}/m/site/dpr`, { waitUntil: "domcontentloaded" });
  await se.page.waitForTimeout(3500);
  await snap(se.page, "wf1-01-form");
  const r1 = await pick(se.page, "Select project", "Tower");
  console.log("project pick:", r1);
  const r2 = await pick(se.page, "Select…", "Foundation");
  console.log("worktype pick:", r2);
  const qty = se.page.locator('input[type="number"]').first();
  if (await qty.count()) await qty.fill("120");
  const summary = se.page.locator("textarea").first();
  if (await summary.count()) await summary.fill("Workflow audit — poured 120 sqft foundation slab, grid C-D.");
  await snap(se.page, "wf1-02-filled");
  const submitBtn = se.page.locator('button[type="submit"], button:has-text("Submit")').last();
  await submitBtn.tap();
  await se.page.waitForTimeout(2500);
  // handle "no labour/materials — submit as no-work day?" confirm
  const noWork = se.page.locator('button:has-text("Submit no-work day")').first();
  if (await noWork.count()) { await noWork.tap(); await se.page.waitForTimeout(3000); }
  await snap(se.page, "wf1-03-submitted");
  console.log("SE submit →", se.page.url());
}

// ═══ WF1b: OWNER views + acts on the DPR ═══
const ow = await session("OWNER");
if (ow.ok) {
  // switch to SRG REALCON (the company with data) via header switcher
  const sw = ow.page.locator('button[aria-label="Switch company"]').first();
  if (await sw.count()) {
    await sw.tap();
    await ow.page.waitForTimeout(1000);
    const opt = ow.page.locator('text=SRG REALCON').first();
    if (await opt.count()) { await opt.tap(); await ow.page.waitForTimeout(2500); }
  }
  await ow.page.goto(`${BASE}/m/dprs`, { waitUntil: "domcontentloaded" });
  await ow.page.waitForTimeout(3000);
  await snap(ow.page, "wf1-04-owner-list");
  const card = ow.page.locator('a[href*="/m/dprs/"]').first();
  if (await card.count()) {
    await card.tap();
    await ow.page.waitForTimeout(3000);
    await snap(ow.page, "wf1-05-owner-detail");
    const approve = ow.page.locator('button:has-text("Approve")').first();
    if (await approve.count()) {
      await approve.tap();
      await ow.page.waitForTimeout(2500);
      await snap(ow.page, "wf1-06-approved");
      console.log("OWNER approve →", ow.page.url());
    } else note("OWNER: no Approve button on DPR detail — check approvals page instead");
  } else note("OWNER: no DPR cards");
}

// ═══ WF2: SE raises indent → PM approves ═══
console.log("── WF2: indent lifecycle ──");
if (se.ok) {
  await se.page.goto(`${BASE}/m/requisitions/new`, { waitUntil: "domcontentloaded" });
  await se.page.waitForTimeout(3500);
  await snap(se.page, "wf2-01-form");
  console.log("project pick:", await pick(se.page, "Select project", "Tower"));
  console.log("material pick:", await pick(se.page, "Select material", "Cement"));
  const qty = se.page.locator('input[type="number"], input[inputmode]').first();
  if (await qty.count()) await qty.fill("50");
  await snap(se.page, "wf2-02-filled");
  const submit = se.page.locator('button:has-text("Submit Indent"), button[type="submit"]').last();
  if (await submit.count()) {
    await submit.tap();
    await se.page.waitForTimeout(4000);
    await snap(se.page, "wf2-03-submitted");
    console.log("SE indent submit →", se.page.url());
  } else note("SE: no submit button on indent form");
}

const pm = await session("PROCUREMENT_MANAGER");
if (pm.ok) {
  await pm.page.goto(`${BASE}/m/requisitions`, { waitUntil: "domcontentloaded" });
  await pm.page.waitForTimeout(3000);
  const chip = pm.page.locator('button:has-text("Submitted"), a:has-text("Submitted")').first();
  if (await chip.count()) { await chip.tap(); await pm.page.waitForTimeout(1500); }
  await snap(pm.page, "wf2-04-pm-list");
  const card = pm.page.locator('a[href*="/m/requisitions/"]').first();
  if (await card.count()) {
    await card.tap();
    await pm.page.waitForTimeout(3000);
    await snap(pm.page, "wf2-05-detail");
    const approve = pm.page.locator('button:has-text("Approve")').first();
    if (await approve.count()) {
      await approve.tap();
      await pm.page.waitForTimeout(2500);
      await snap(pm.page, "wf2-06-approved");
      console.log("PM approve →", pm.page.url());
    } else note("PM: no Approve button on indent detail — approval likely lives in list swipe/context menu");
  } else note("PM: no SUBMITTED indent cards");
}

console.log("\n=== FINDINGS ===");
findings.forEach((f) => console.log(" -", f));
console.log("=== ERRORS ===");
errs.forEach((e) => console.log(" !", e));
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, errs }, null, 1));
await browser.close();
console.log("DONE");
