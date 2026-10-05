/**
 * qa-spine-flow.mjs — drive the business spine on mobile UI:
 * material → indent → submit → approve → DPR.
 * Each step asserts a real DB row landed.
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");

const BASE = "http://localhost:3000";
const prisma = new PrismaClient();
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const STAMP = Date.now().toString(36).slice(-6).toUpperCase();
const MAT_NAME = `QA Spine ${STAMP}`;

const results = [];
function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

async function signIn(context, role = "OWNER") {
  const p = await context.newPage();
  const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role } });
  const { email, password } = await res.json();
  const r2 = await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
  if (!r2.ok()) throw new Error("sign-in failed: " + (await r2.text()));
  await p.close();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await signIn(ctx);
const page = await ctx.newPage();
page.setDefaultTimeout(40000);
page.on("dialog", (d) => d.accept().catch(() => {}));

const project = await prisma.project.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
console.log(`project: ${project?.name} (${project?.id})`);

try {
  // ── 1. Create material ────────────────────────────────────────────
  await page.goto(`${BASE}/m/materials/new`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: /Cement OPC/i }).or(page.getByPlaceholder(/OPC|name/i)).first().fill(MAT_NAME);
  await page.getByRole("button", { name: /create material/i }).click();
  await page.waitForTimeout(4000);
  const mat = await prisma.material.findFirst({ where: { name: MAT_NAME } });
  step("create material via /m/materials/new", !!mat, mat?.code);

  // ── 2. Raise indent (project + material prefilled via URL) ────────
  let reqId = null;
  if (mat && project) {
    await page.goto(`${BASE}/m/requisitions/new?project=${project.id}&materialId=${mat.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // let smart-defaults effect run
    const qty = page.locator('main input[placeholder="Qty"]').first();
    if (await qty.count()) await qty.fill("120");
    await page.getByRole("button", { name: /submit indent/i }).click();
    await page.waitForTimeout(4000);
    const req = await prisma.materialRequisition.findFirst({
      where: { lines: { some: { materialId: mat.id } } },
      orderBy: { createdAt: "desc" },
    });
    reqId = req?.id ?? null;
    step("indent submitted via /m/requisitions/new", !!reqId, `${req?.reqNumber} status=${req?.status}`);
  }

  // ── 3. DPR submit via /m/site/dpr ─────────────────────────────────
  if (project) {
    await page.goto(`${BASE}/m/site/dpr?project=${project.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const summary = page.locator('main textarea[placeholder*="What work"]').first();
    await summary.fill(`QA spine DPR ${STAMP} — footing cast`);
    await page.getByRole("button", { name: /^Submit DPR$/i }).click();
    await page.waitForTimeout(4000);
    // possible "no-work day" confirm
    const confirm = page.getByRole("button", { name: /no-work|submit anyway|confirm/i });
    if (await confirm.count()) { await confirm.first().click(); await page.waitForTimeout(2500); }
    const dpr = await prisma.dailyProgressReport.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    });
    step("DPR submitted via /m/site/dpr", !!dpr && /QA spine/.test(dpr.workSummary ?? ""), dpr?.dprNumber ?? dpr?.id);
  }

  // ── 4. Expense via /m/expenses/new ────────────────────────────────
  // ── 5. Approve the indent (as OWNER self-approval is tier-1 allowed) ──
  if (reqId) {
    await page.goto(`${BASE}/m/requisitions/${reqId}`, { waitUntil: "networkidle" });
    const body = await page.locator("main").innerText().catch(() => "");
    step("indent detail renders", body.length > 100, `mainLen=${body.length}`);
    const approveBtn = page.getByRole("button", { name: /approve/i }).first();
    if (await approveBtn.count()) {
      await approveBtn.click();
      await page.waitForTimeout(2500);
      const confirm = page.getByRole("button", { name: /confirm|yes, approve|approve/i });
      if (await confirm.count()) { await confirm.first().click(); await page.waitForTimeout(2500); }
    }
    const req = await prisma.materialRequisition.findUnique({ where: { id: reqId } });
    step("indent approve action", req?.status === "APPROVED" || req?.status === "CONVERTED", `status=${req?.status}`);
  }
} catch (e) {
  step("run", false, String(e).slice(0, 300));
  await page.screenshot({ path: "/tmp/spine-fail.png" });
}

console.log("\n=== summary ===");
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
await prisma.$disconnect();
