// Interactive mobile audit — click things, observe behavior, collect errors.
import { chromium } from "@playwright/test";
import fs from "fs";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = "/tmp/mobile-interactive";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

const errs = [];
page.on("pageerror", (e) => errs.push(`PAGEERROR ${page.url()}: ${String(e).slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("MutationObserver")) errs.push(`CONSOLE ${page.url()}: ${m.text().slice(0, 200)}`);
});

const findings = [];
const snap = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const note = (f) => { findings.push(f); console.log("NOTE:", f); };

// ── Login as OWNER ──
await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const creds = await page.evaluate(async () => {
  const res = await fetch("/api/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "OWNER" }),
  });
  return res.json();
});
await page.getByRole("button", { name: /^Email$/ }).first().click();
await page.locator('input[type="email"]').fill(creds.email);
await page.locator('input[type="password"]').fill(creds.password);
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 30000 });
console.log("logged in:", page.url());

// ── 1. Home: tap orbit nodes ──
await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await snap("01-home");

// tap "Projects" orbit node
const projNode = page.locator('text=/^Projects$/').first();
if (await projNode.count()) {
  await projNode.tap();
  await page.waitForTimeout(1200);
  await snap("02-orbit-projects");
  if (!page.url().includes("project")) note(`orbit Projects tap → stayed on ${page.url()}`);
} else note("orbit Projects node not found");

// ── 2. Center FAB → quick actions ──
await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const fab = page.locator('button:has(svg)').filter({ has: page.locator('svg.lucide-plus, svg.lucide-x') }).last();
const fabAlt = page.locator('button[aria-label*="add" i], button[aria-label*="new" i], button[aria-label*="create" i]').first();
if (await fabAlt.count()) {
  await fabAlt.tap();
  await page.waitForTimeout(900);
  await snap("03-fab-open");
} else note("no FAB found by aria-label");

// ── 3. Bottom nav tabs ──
for (const tab of ["Inventory", "HR", "Accounts"]) {
  const t = page.locator(`nav >> text=${tab}, footer >> text=${tab}, a:has-text("${tab}")`).last();
  if (await t.count()) {
    await t.tap();
    await page.waitForTimeout(1500);
    await snap(`04-nav-${tab.toLowerCase()}`);
    console.log(`nav ${tab} -> ${page.url()}`);
  } else note(`bottom nav "${tab}" not found`);
}

// ── 4. Materials list: search + tap first item ──
await page.goto(`${BASE}/m/materials`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const search = page.locator('input[placeholder*="earch"]').first();
if (await search.count()) {
  await search.fill("cement");
  await page.waitForTimeout(800);
  await snap("05-materials-search");
} else note("materials search input not found");

// tap first material card
const firstCard = page.locator('a[href*="/m/materials/"]').first();
if (await firstCard.count()) {
  const href = await firstCard.getAttribute("href");
  await firstCard.tap();
  await page.waitForTimeout(2000);
  await snap("06-material-detail");
  if (!page.url().includes("/m/materials/")) note(`material card tap → stayed on ${page.url()} (expected ${href})`);
} else note("no material card links found");

// ── 5. Site dashboard → Submit DPR ──
await page.goto(`${BASE}/m/site`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const dprCard = page.locator('a[href*="dpr"], button:has-text("Submit DPR"), a:has-text("Submit DPR")').first();
if (await dprCard.count()) {
  await dprCard.tap();
  await page.waitForTimeout(2500);
  await snap("07-dpr-form");
  console.log("dpr page:", page.url());
} else note("Submit DPR entry not found on /m/site");

// ── 6. Approvals ──
await page.goto(`${BASE}/m/approvals`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await snap("08-approvals");

// ── 7. Procurement tabs ──
await page.goto(`${BASE}/m/procurement`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await snap("09-procurement");
for (const tabText of ["Indents", "POs", "Quotes", "Orders"]) {
  const t = page.locator(`[role="tab"]:has-text("${tabText}"), button:has-text("${tabText}")`).first();
  if (await t.count()) {
    await t.tap();
    await page.waitForTimeout(1000);
    await snap(`09-procurement-${tabText.toLowerCase()}`);
  }
}

// ── 8. Requisitions: long-press context menu ──
await page.goto(`${BASE}/m/requisitions`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await snap("10-requisitions");
const reqCard = page.locator('a[href*="/m/requisitions/"]').first();
if (await reqCard.count()) {
  // long-press simulation: tap & hold 700ms
  const box = await reqCard.boundingBox();
  if (box) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(2000);
    await snap("11-req-detail");
    console.log("req card tap ->", page.url());
  }
} else note("no requisition cards to tap");

// ── 9. Me / profile ──
await page.goto(`${BASE}/m/me`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await snap("12-me");

// ── 10. Header icons: search, mic, bell ──
await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
for (const [name, sel] of [
  ["search", 'button:has(svg.lucide-search), a:has(svg.lucide-search)'],
  ["bell", 'button:has(svg.lucide-bell), a:has(svg.lucide-bell)'],
  ["mic", 'button:has(svg.lucide-mic)'],
]) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    await el.tap();
    await page.waitForTimeout(1200);
    await snap(`13-header-${name}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else note(`header ${name} icon not found`);
}

console.log("\n=== FINDINGS ===");
findings.forEach((f) => console.log(" -", f));
console.log("=== ERRORS ===");
errs.forEach((e) => console.log(" !", e));
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, errs }, null, 1));
await browser.close();
console.log("DONE");
