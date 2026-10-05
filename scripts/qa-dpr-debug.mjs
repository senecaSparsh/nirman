import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
await p.close();

const page = await ctx.newPage();
page.setDefaultTimeout(40000);
page.on("dialog", (d) => { console.log("DIALOG:", d.message()); d.accept().catch(() => {}); });
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) console.log(`API ${r.status()} ${r.url().replace(BASE, "")}`); });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });

const project = await prisma.project.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
await page.goto(`${BASE}/m/site/dpr?project=${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("main text (first 800):", (await page.locator("main").innerText()).slice(0, 800).replace(/\n/g, " | "));

const summary = page.locator('main textarea[placeholder*="What work"]').first();
console.log("summary textarea count:", await summary.count());
await summary.fill("QA spine DPR — footing cast");
// what does the submit area look like?
const btns = await page.locator("main button").allInnerTexts();
console.log("buttons:", btns.filter(Boolean).slice(-8));
await page.getByRole("button", { name: /submit dpr|update dpr/i }).last().click();
await page.waitForTimeout(4000);
console.log("after submit URL:", page.url());
console.log("main now:", (await page.locator("main").innerText()).slice(0, 400).replace(/\n/g, " | "));
await page.screenshot({ path: "/tmp/dpr-debug.png", fullPage: true });
const dpr = await prisma.dailyProgressReport.findFirst({ orderBy: { createdAt: "desc" } });
console.log("latest DPR:", dpr?.id, dpr?.workSummary?.slice(0, 50), dpr?.createdAt);
await browser.close(); await prisma.$disconnect();
