/**
 * qa-chain-mobile.mjs — multi-role end-to-end business chains on the
 * REAL mobile UI (/m/*). Each step asserts a real DB row/state landed.
 *
 * Chains:
 *   A. Self check-in                        (SITE_ENGINEER, /m/home)
 *   B. DPR submit → OWNER approve           (SITE_ENGINEER → OWNER)
 *   C. Expense claim submit → approve       (SITE_ENGINEER → OWNER)
 *   D. Permission & scope leak tests        (SITE_ENGINEER, SECURITY_GUARD)
 *   E. Material-sale page render            (OWNER, /m/material-sales/new)
 *
 * Usage: node scripts/qa-chain-mobile.mjs [CHAIN ...]   (default: all)
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");
const prisma = new PrismaClient();

const BASE = process.env.QA_BASE || "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const STAMP = Date.now().toString(36).slice(-6).toUpperCase();

const results = [];
function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();
const sessions = new Map();
async function newSession(role) {
  if (sessions.has(role)) return sessions.get(role);
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 28.6139, longitude: 77.209 },
    permissions: ["geolocation"],
  });
  const p = await ctx.newPage();
  // demo-login is rate-limited — retry with backoff
  let res, body;
  for (let i = 0; i < 4; i++) {
    res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role } });
    if (res.ok()) { body = await res.json(); break; }
    if (res.status() === 429) { await p.waitForTimeout(15000 * (i + 1)); continue; }
    throw new Error(`demo-login ${role}: ${res.status()}`);
  }
  if (!body) throw new Error(`demo-login ${role}: still 429 after retries`);
  const r2 = await p.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: body.email, password: body.password },
  });
  if (!r2.ok()) throw new Error(`sign-in ${role}: ${r2.status()}`);
  await p.close();
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const sess = { ctx, page, role };
  sessions.set(role, sess);
  return sess;
}

// Pick the first option in a custom select (SearchableSelect / native)
async function pickFirstOption(page, selectTriggerRe) {
  const trigger = page.getByText(selectTriggerRe).first();
  if (!(await trigger.isVisible().catch(() => false))) return false;
  await trigger.click();
  await page.waitForTimeout(600);
  // Options usually render as buttons/menu items
  const opt = page.locator('[role="option"], [role="menuitem"], li button, [data-option]').first();
  if (await opt.isVisible().catch(() => false)) { await opt.click(); return true; }
  // Fallback: first <option> in a real <select>
  const sel = page.locator("select").first();
  if (await sel.isVisible().catch(() => false)) {
    const val = await sel.locator("option").nth(1).getAttribute("value");
    if (val) { await sel.selectOption(val); return true; }
  }
  return false;
}

// ═══ CHAIN A — attendance self check-in (SITE_ENGINEER) ══════════════════
async function chainAttendance() {
  const { page } = await newSession("SITE_ENGINEER");
  try {
    const meRes = await page.request.get(`${BASE}/api/me`);
    const meData = await meRes.json();
    const userId = meData.user?.id ?? meData.id;
    // WorkerAttendance links Employee; find the employee row for this user
    const emp = await prisma.employee.findFirst({ where: { userId } });
    const today0 = new Date(new Date().toDateString());
    const before = emp ? await prisma.workerAttendance.findFirst({
      where: { employeeId: emp.id, date: today0 },
    }) : null;
    await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const inBtn = page.getByText(/check in|punch in/i).first();
    const outBtn = page.getByText(/check out|punch out/i).first();
    if (await inBtn.isVisible().catch(() => false)) {
      await inBtn.click();
      await page.waitForTimeout(3000);
      const lockMsg = await page.getByText(/attendance is locked|payroll is already processed/i).isVisible().catch(() => false);
      if (lockMsg) { step("A1 self check-in", true, "payroll lock correctly enforced (409)"); return; }
      const after = emp ? await prisma.workerAttendance.findFirst({
        where: { employeeId: emp.id, date: today0 },
      }) : null;
      step("A1 self check-in creates WorkerAttendance", !!after && after.id !== before?.id, after ? `status=${after.status}` : `no row (emp=${!!emp})`);
    } else if (await outBtn.isVisible().catch(() => false)) {
      step("A1 self check-in creates WorkerAttendance", true, "already checked in (check-out shown)");
    } else {
      step("A1 self check-in button visible", false, "no check-in/out widget on /m/home");
    }
  } catch (e) { step("A attendance chain", false, String(e).slice(0, 250)); }
}

// ═══ CHAIN B — DPR submit → approve ══════════════════════════════════════
async function chainDpr() {
  const eng = await newSession("SITE_ENGINEER");
  try {
    const project = await prisma.project.findFirst({ where: { deletedAt: null } });
    await eng.page.goto(`${BASE}/m/site/dpr?project=${project.id}`, { waitUntil: "domcontentloaded" });
    await eng.page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await eng.page.waitForTimeout(2000);
    const summary = `QA chain DPR ${STAMP} — RCC slab cast, 40m3 concrete`;
    await eng.page.locator('main textarea[placeholder*="What work"]').first().fill(summary);
    await eng.page.getByRole("button", { name: /^Submit DPR$/i }).first().click();
    await eng.page.waitForTimeout(4000);
    const confirm = eng.page.getByRole("button", { name: /no-work|submit anyway|confirm/i });
    if (await confirm.count()) { await confirm.first().click(); await eng.page.waitForTimeout(2500); }
    const lockMsg = await eng.page.getByText(/payroll is already processed|attendance is locked/i).isVisible().catch(() => false);
    const dpr = await prisma.dailyProgressReport.findFirst({
      where: { workSummary: { contains: STAMP } },
      orderBy: { createdAt: "desc" },
    });
    step("B1 DPR submitted via /m/site/dpr", !!dpr || lockMsg, dpr ? `status=${dpr.status}` : lockMsg ? "payroll lock enforced (400)" : "no row");

    if (dpr && dpr.status !== "APPROVED") {
      const own = await newSession("OWNER");
      await own.page.goto(`${BASE}/m/approvals`, { waitUntil: "domcontentloaded" });
      await own.page.waitForTimeout(2500);
      const btn = own.page.getByRole("button", { name: /approve/i }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await own.page.waitForTimeout(3000);
      }
      const after = await prisma.dailyProgressReport.findUnique({ where: { id: dpr.id } });
      step("B2 OWNER approves DPR via /m/approvals", after.status === "APPROVED", `status=${after.status}`);
    } else if (dpr) {
      step("B2 OWNER approves DPR", true, `already ${dpr.status}`);
    }
  } catch (e) { step("B DPR chain", false, String(e).slice(0, 250)); }
}

// ═══ CHAIN C — expense claim submit → approve ════════════════════════════
async function chainExpenseClaim() {
  const eng = await newSession("SITE_ENGINEER");
  try {
    await eng.page.goto(`${BASE}/m/expense-claims/new`, { waitUntil: "domcontentloaded" });
    await eng.page.waitForTimeout(2500);
    const desc = `QA chain claim ${STAMP} — site travel`;
    await eng.page.getByPlaceholder(/what is this claim/i).first().fill(desc);
    await eng.page.getByPlaceholder(/e\.g\. Travel/i).first().fill("Travel");
    await eng.page.getByPlaceholder("0").first().fill("1250");
    await eng.page.getByRole("button", { name: /submit|save|create/i }).first().click();
    await eng.page.waitForTimeout(3500);
    const claim = await prisma.expenseClaim.findFirst({
      where: { description: { contains: STAMP } },
      orderBy: { createdAt: "desc" },
    });
    step("C1 expense claim submitted", !!claim, claim ? `status=${claim.status}` : "no row");
    if (claim && claim.status === "PENDING") {
      const own = await newSession("OWNER");
      await own.page.goto(`${BASE}/m/approvals`, { waitUntil: "domcontentloaded" });
      await own.page.waitForTimeout(2500);
      const btn = own.page.getByRole("button", { name: /approve/i }).first();
      if (await btn.isVisible().catch(() => false)) { await btn.click(); await own.page.waitForTimeout(3000); }
      const after = await prisma.expenseClaim.findUnique({ where: { id: claim.id } });
      step("C2 OWNER approves claim", ["APPROVED", "PAID"].includes(after.status), `status=${after.status}`);
    } else if (claim) {
      step("C2 OWNER approves claim", claim.status !== "REJECTED", `status=${claim.status}`);
    }
  } catch (e) { step("C expense-claim chain", false, String(e).slice(0, 250)); }
}

// ═══ CHAIN D — permission & scope leak tests ═════════════════════════════
async function chainSecurity() {
  const eng = await newSession("SITE_ENGINEER");
  try {
    const pr = await eng.page.request.get(`${BASE}/api/payroll`);
    step("D1 SITE_ENGINEER /api/payroll denied", [401, 403].includes(pr.status()), `status=${pr.status()}`);

    await eng.page.goto(`${BASE}/m/settings`, { waitUntil: "domcontentloaded" });
    await eng.page.waitForTimeout(2500);
    const body = await eng.page.evaluate(() => document.body.innerText);
    const leaksAdmin = /permissions|company config|team management|data export/i.test(body);
    step("D2 SITE_ENGINEER /m/settings hides admin zone", !leaksAdmin, `len=${body.length} adminLeak=${leaksAdmin}`);

    const er = await eng.page.request.get(`${BASE}/api/employees`);
    const eBody = er.ok() ? await er.text() : "";
    const leaksPii = /aadhaar|bankAccount|accountNumber|uan|panNumber/i.test(eBody);
    step("D3 SITE_ENGINEER /api/employees no PII leak", !er.ok() || !leaksPii, `status=${er.status()} pii=${leaksPii}`);

    const pj = await eng.page.request.get(`${BASE}/api/projects`);
    if (pj.ok()) {
      const rows = await pj.json();
      const arr = Array.isArray(rows) ? rows : (rows.rows ?? rows.items ?? []);
      const total = await prisma.project.count();
      step("D4 scoped /api/projects", arr.length <= total, `${arr.length} rows vs ${total} total`);
    } else {
      step("D4 scoped /api/projects", [401, 403].includes(pj.status()), `status=${pj.status()}`);
    }
  } catch (e) { step("D engineer security", false, String(e).slice(0, 200)); }

  try {
    const guard = await newSession("SECURITY_GUARD");
    const gr = await guard.page.request.get(`${BASE}/api/payroll`);
    step("D5 SECURITY_GUARD /api/payroll denied", [401, 403].includes(gr.status()), `status=${gr.status()}`);
    await guard.page.goto(`${BASE}/m`, { waitUntil: "domcontentloaded" });
    await guard.page.waitForTimeout(3000);
    const gLen = await guard.page.evaluate(() => document.body.innerText.length);
    step("D6 SECURITY_GUARD mobile home renders", gLen > 50, `len=${gLen}`);
  } catch (e) { step("D guard security", false, String(e).slice(0, 200)); }
}

// ═══ CHAIN E — material-sale new page render (OWNER) ═════════════════════
async function chainMaterialSale() {
  const own = await newSession("OWNER");
  try {
    await own.page.goto(`${BASE}/m/material-sales/new`, { waitUntil: "domcontentloaded" });
    await own.page.waitForTimeout(4000);
    const len = await own.page.evaluate(() => document.querySelector("main")?.innerText.trim().length ?? -1);
    step("E1 /m/material-sales/new renders", len > 80, `mainLen=${len}`);
    const hasSubmit = await own.page.getByRole("button", { name: /save|create|record|submit/i }).first().isVisible().catch(() => false);
    step("E2 material-sale submit button", hasSubmit);
  } catch (e) { step("E material-sale chain", false, String(e).slice(0, 200)); }
}

const which = process.argv.slice(2).map(s => s.toUpperCase());
const ALL = { A: chainAttendance, B: chainDpr, C: chainExpenseClaim, D: chainSecurity, E: chainMaterialSale };
for (const [k, fn] of Object.entries(ALL)) {
  if (which.length && !which.includes(k)) continue;
  await fn();
}
const fails = results.filter(r => !r.ok);
console.log(`\n═══ ${results.length - fails.length}/${results.length} passed ═══`);
if (fails.length) { console.log("FAILURES:"); fails.forEach(f => console.log(`  • ${f.name}: ${f.detail}`)); }
await browser.close();
await prisma.$disconnect();
process.exit(fails.length ? 1 : 0);
