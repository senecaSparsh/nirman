/**
 * qa-mobile-sweep.mjs — crawl every /m/* route as a signed-in mobile user.
 *
 * Usage: node scripts/qa-mobile-sweep.mjs [ROLE] [--detail]
 *   ROLE: OWNER (default) | ADMIN | SITE_ENGINEER | FINANCE_HEAD | ...
 *   --detail: also visit [id] detail pages using real DB ids (slower)
 *
 * Reports per-route: HTTP status, main-content length, console errors,
 * failed API calls. Writes JSON to /tmp/qa-sweep-*.json
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");

const BASE = process.env.QA_BASE || "http://localhost:3000";
const AUTH_BASE = process.env.QA_AUTH_BASE || BASE; // demo-login lives on dev server
const ROLE = process.argv[2] || "OWNER";
const DETAIL = process.argv.includes("--detail");
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const prisma = new PrismaClient();

// ── routes ─────────────────────────────────────────────────────────────
// Prefer a pre-generated route list (/tmp/m-routes.txt); otherwise derive
// routes by scanning apps/web/src/app/m/**/page.tsx so the script is
// self-contained.
const __dirnameRoot = path.dirname(fileURLToPath(import.meta.url));

function scanMobileRoutes() {
  const root = path.resolve(__dirnameRoot, "../apps/web/src/app/m");
  if (!fs.existsSync(root)) {
    throw new Error(`Cannot scan routes: ${root} does not exist (run from the repo root checkout)`);
  }
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") {
        const rel = "/" + path.relative(root, path.dirname(full)).split(path.sep).join("/");
        out.push(rel === "/." ? "/m" : `/m${rel}`);
      }
    }
  })(root);
  return out.sort();
}

const routes = fs.existsSync("/tmp/m-routes.txt")
  ? fs.readFileSync("/tmp/m-routes.txt", "utf8").trim().split("\n")
  : scanMobileRoutes();

const FROM_IDX = process.argv.findIndex((a) => a === "--from");
const FROM = FROM_IDX > -1 ? process.argv[FROM_IDX + 1] : null;
const ONLY_IDX = process.argv.findIndex((a) => a === "--only");
const ONLY = ONLY_IDX > -1 ? process.argv[ONLY_IDX + 1].split(",") : null;

let staticRoutes = routes.filter((r) => !r.includes("["));
const detailRoutes = routes.filter((r) => r.includes("[id]"));
if (FROM) staticRoutes = staticRoutes.slice(staticRoutes.indexOf(FROM));
if (ONLY) staticRoutes = staticRoutes.filter((r) => ONLY.includes(r));

// map /m/<seg>/[id] -> prisma model + optional extra where
const DETAIL_MODEL = {
  "/m/boq/[id]": "boqItem",
  "/m/brokers/[id]": null,
  "/m/budget-variance/[id]": "project",
  "/m/calls/[id]": "callLog",
  "/m/change-orders/[id]": "changeOrder",
  "/m/customers/[id]": "customer",
  "/m/dprs/[id]": "dailyProgressReport",
  "/m/equipment/[id]": "equipment",
  "/m/expense-claims/[id]": "expenseClaim",
  "/m/expenses/[id]": "expense",
  "/m/hr/employees/[id]": "employee",
  "/m/hr/onboarding/[id]": "employee",
  "/m/land/[id]": "landPurchase",
  "/m/leads/[id]": "lead",
  "/m/material-issues/[id]": "materialIssue",
  "/m/material-sales/[id]": "materialSale",
  "/m/materials/[id]": "material",
  "/m/materials/[id]/edit": "material",
  "/m/measurement-book/[id]": "measurementBookEntry",
  "/m/portal-listings/[id]": "portalListing",
  "/m/procurement/[id]": "purchaseOrder",
  "/m/project-control/[id]": "project",
  "/m/projects/[id]": "project",
  "/m/quality-control/ncr/[id]": "nonConformanceReport",
  "/m/quotations/[id]": "quotationRequest",
  "/m/rate-contracts/[id]": "rateContract",
  "/m/rentals/[id]": "tenancy",
  "/m/requisitions/[id]": "materialRequisition",
  "/m/safety/hazards/[id]": "safetyHazard",
  "/m/safety/incidents/[id]": "safetyIncident",
  "/m/safety/inspections/[id]": "safetyInspection",
  "/m/sales/[id]": "assetSale",
  "/m/scrap-generations/[id]": "scrapGeneration",
  "/m/standard-consumptions/[id]": "standardConsumption",
  "/m/stock-counts/[id]": "stockCount",
  "/m/stock/[id]": "stockLocation",
  "/m/subcontractors/[id]": "subcontractor",
  "/m/supplier-returns/[id]": "supplierReturn",
  "/m/suppliers/[id]": "supplier",
  "/m/transfers/[id]": "stockTransfer",
  "/m/units/[id]": "builtUnit",
  "/m/wbs/[id]": "wbsNode",
  "/m/work-orders/[id]": "subcontractorWorkOrder",
  "/m/workflows/[id]": "workflow",
  "/m/books/receipts/[id]": "assetSalePayment",
  "/m/print/[type]/[id]": null,
};

async function realId(model) {
  if (!model || !prisma[model]) return null;
  try {
    const row = await prisma[model].findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    return row?.id ?? (await prisma[model].findFirst({ select: { id: true } }))?.id ?? null;
  } catch {
    try {
      const row = await prisma[model].findFirst({ select: { id: true } });
      return row?.id ?? null;
    } catch {
      return null;
    }
  }
}

// ── auth ───────────────────────────────────────────────────────────────
async function signIn(context, role) {
  const page = await context.newPage();
  const res = await page.request.post(`${AUTH_BASE}/api/auth/demo-login`, {
    data: { role },
  });
  if (!res.ok()) throw new Error(`demo-login ${role}: ${res.status()} ${await res.text()}`);
  const { email, password } = await res.json();
  const r2 = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  });
  if (!r2.ok()) throw new Error(`sign-in ${email}: ${r2.status()} ${await r2.text()}`);
  await page.close();
}

// ── main ───────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({
  userAgent: MOBILE_UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await signIn(context, ROLE);

const page = await context.newPage();
const results = [];

// Pre-warm Turbopack's per-route compile with a cheap HTTP hit so the
// browser navigation hits a warm cache (avoids 45s nav timeouts under
// a cold-compile storm).
async function prewarm(route) {
  try {
    await page.request.get(`${BASE}${route}`, { timeout: 150000 });
  } catch {}
}

async function visit(route) {
  const consoleErrs = [];
  const failedReqs = [];
  const onConsole = (m) => {
    if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200));
  };
  const onResp = (r) => {
    if (r.status() >= 400 && !r.url().includes("/monitoring")) failedReqs.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 120)}`);
  };
  page.on("console", onConsole);
  page.on("response", onResp);
  let status = 0;
  let mainLen = 0;
  let title = "";
  let navFail = null;
  try {
    await prewarm(route);
    const resp = await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 150000,
    });
    status = resp?.status() ?? 0;
    title = await page.title();
    // let client fetches settle
    try {
      await page.waitForLoadState("networkidle", { timeout: 8000 });
    } catch {}
    await page.waitForTimeout(400);
    mainLen = await page.evaluate(() => {
      const m = document.querySelector("main");
      return m ? m.innerText.trim().length : -1;
    });
  } catch (e) {
    navFail = String(e).slice(0, 160);
  }
  page.off("console", onConsole);
  page.off("response", onResp);
  results.push({
    route,
    status,
    title,
    mainLen,
    consoleErrs: [...new Set(consoleErrs)].slice(0, 4),
    failedReqs: [...new Set(failedReqs)].slice(0, 5),
    navFail,
  });
}

console.log(`Sweeping ${staticRoutes.length} static routes as ${ROLE}…`);
for (const r of staticRoutes) {
  await visit(r);
  const last = results[results.length - 1];
  const flag =
    last.navFail || last.status >= 400 || last.mainLen <= 0 || last.consoleErrs.length || last.failedReqs.length
      ? " ⚠"
      : "";
  console.log(`  ${r} -> ${last.status} main=${last.mainLen}${flag}`);
}

if (DETAIL) {
  console.log(`\nDetail routes:`);
  for (const r of detailRoutes) {
    const model = DETAIL_MODEL[r];
    const id = model ? await realId(model) : null;
    if (!id) {
      results.push({ route: r, status: 0, title: "", mainLen: -2, consoleErrs: [], failedReqs: [], navFail: `no id for model ${model}` });
      console.log(`  ${r} -> SKIP (no ${model} row)`);
      continue;
    }
    const url = r.replace("[id]", id);
    await visit(url);
    const last = results[results.length - 1];
    last.route = `${r} (${url})`;
    const flag =
      last.navFail || last.status >= 400 || last.mainLen <= 0 || last.consoleErrs.length || last.failedReqs.length
        ? " ⚠"
        : "";
    console.log(`  ${url} -> ${last.status} main=${last.mainLen}${flag}`);
  }
}

const out = `/tmp/qa-sweep-${ROLE.toLowerCase()}.json`;
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nWrote ${out}`);
await browser.close();
await prisma.$disconnect();
