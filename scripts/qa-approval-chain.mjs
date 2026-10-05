/** Two-actor approval chain: SITE_ENGINEER submits indent → OWNER approves via /m/approvals */
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

async function newSession(role) {
  const ctx = await chromium.launch().then((b) => b.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
  const p = await ctx.newPage();
  const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role } });
  const { email, password } = await res.json();
  await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
  await p.close();
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return { ctx, page };
}

const mat = await prisma.material.findFirst({ where: { deletedAt: null } });
const project = await prisma.project.findFirst({ where: { deletedAt: null } });
console.log("material:", mat?.name, "| project:", project?.name);

// SITE_ENGINEER submits an indent (should land SUBMITTED, not auto-approved)
const eng = await newSession("SITE_ENGINEER");
await eng.page.goto(`${BASE}/m/requisitions/new?project=${project.id}&materialId=${mat.id}`, { waitUntil: "networkidle" });
await eng.page.waitForTimeout(1500);
await eng.page.locator('main input[placeholder="Qty"]').first().fill("75");
await eng.page.getByRole("button", { name: /submit indent/i }).click();
await eng.page.waitForTimeout(4000);
const req = await prisma.materialRequisition.findFirst({
  where: { lines: { some: { materialId: mat.id } }, status: "SUBMITTED" },
  orderBy: { createdAt: "desc" },
});
console.log("engineer indent:", req?.reqNumber, req?.status);

// OWNER sees it in approvals and approves
const own = await newSession("OWNER");
await own.page.goto(`${BASE}/m/approvals`, { waitUntil: "networkidle" });
await own.page.waitForTimeout(1500);
const approvalsText = await own.page.locator("main").innerText();
console.log("approvals page shows req?", req ? approvalsText.includes(req.reqNumber) : "n/a");
console.log("approvals text:", approvalsText.slice(0, 600).replace(/\n/g, " | "));
await own.page.screenshot({ path: "/tmp/approvals.png" });

await eng.ctx.close(); await own.ctx.close(); await prisma.$disconnect();
