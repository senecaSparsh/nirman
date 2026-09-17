// Round 2: verify header-z fix + exercise deeper flows (DPR submit validation,
// notification bell, context menu, quote loading).
import { chromium } from "@playwright/test";
import fs from "fs";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = "/tmp/mobile-interactive2";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

const errs = [];
page.on("pageerror", (e) => errs.push(`PAGEERROR ${page.url()}: ${String(e).slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("MutationObserver")) errs.push(`CONSOLE ${page.url()}: ${m.text().slice(0, 200)}`);
});
const snap = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const findings = [];
const note = (f) => { findings.push(f); console.log("NOTE:", f); };

// login
await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const creds = await page.evaluate(async () => {
  const r = await fetch("/api/auth/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "OWNER" }) });
  return r.json();
});
await page.getByRole("button", { name: /^Email$/ }).first().click();
await page.locator('input[type="email"]').fill(creds.email);
await page.locator('input[type="password"]').fill(creds.password);
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 30000 });

// dismiss product tour if it auto-started (intro "Not now" or in-tour "Skip")
for (const sel of ['button:has-text("Not now")', 'button:has-text("Skip")', '[aria-label="Skip tour"]']) {
  const el = page.locator(sel).first();
  if (await el.count()) { await el.tap(); await page.waitForTimeout(800); break; }
}

// ── 1. Notification bell over orbit (verify z-index fix) ──
await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
for (const sel of ['button:has-text("Not now")', 'button:has-text("Skip")', '[aria-label="Skip tour"]']) {
  const el = page.locator(sel).first();
  if (await el.count()) { await el.tap(); await page.waitForTimeout(800); break; }
}
const bell = page.locator('button:has(svg.lucide-bell), a:has(svg.lucide-bell)').first();
await bell.tap();
await page.waitForTimeout(1000);
await snap("01-notif-over-orbit");

// ── 2. DPR form: submit empty → validation? ──
await page.goto(`${BASE}/m/site/dpr`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const submitBtn = page.locator('button:has-text("Submit"), button[type="submit"]').last();
if (await submitBtn.count()) {
  await submitBtn.tap();
  await page.waitForTimeout(1200);
  await snap("02-dpr-empty-submit");
}

// ── 3. Req detail: wait for quotes to finish loading ──
await page.goto(`${BASE}/m/requisitions`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const reqCard = page.locator('a[href*="/m/requisitions/"]').first();
await reqCard.tap();
await page.waitForTimeout(4000);
const loadingQuotes = await page.locator('text=/Loading quotes|Loading attachments/').count();
await snap("03-req-detail-settled");
if (loadingQuotes > 0) note("requisition detail still shows 'Loading quotes...' after 4s");

// ── 4. Long-press on req card → context menu ──
await page.goto(`${BASE}/m/requisitions`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const card = page.locator('a[href*="/m/requisitions/"]').first();
if (await card.count()) {
  const box = await card.boundingBox();
  // simulate long-press via dispatched touch events
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); // quick tap first (navigates?) — skip
  await page.goBack();
  await page.waitForTimeout(1500);
  const card2 = page.locator('a[href*="/m/requisitions/"]').first();
  const box2 = await card2.boundingBox();
  // real long-press: down, wait 700ms, up
  await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [touch], bubbles: true }));
    setTimeout(() => {
      el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
    }, 750);
  }, [box2.x + box2.width / 2, box2.y + box2.height / 2]);
  await page.waitForTimeout(1500);
  await snap("04-req-longpress");
  const menuVisible = await page.locator('[role="menu"], [class*="context-menu"], text=/Approve|Reject|Copy|Share/').count();
  if (!menuVisible) note("long-press on requisition card did not open a context menu");
}

// ── 5. Swipe action on DPR list ──
await page.goto(`${BASE}/m/dprs`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await snap("05-dprs-list");
const dprCard = page.locator('a[href*="/m/dprs/"]').first();
if (await dprCard.count()) {
  const box = await dprCard.boundingBox();
  // swipe left: touch drag from right→left
  await page.touchscreen.tap(box.x + box.width - 30, box.y + box.height / 2); // tap first to see it works
  await page.waitForTimeout(1500);
  console.log("dpr tap ->", page.url());
}

// ── 6. Dept FAB fan (center +) ──
await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const deptFab = page.locator('button[data-tour="dept-fab"], button[aria-label*="departments" i]').first();
if (await deptFab.count()) {
  await deptFab.tap();
  await page.waitForTimeout(1200);
  await snap("06-dept-fan");
  const chips = await page.locator('[class*="chip"], [role="menuitem"], a[href^="/m/"]').count();
  console.log("dept fan elements:", chips);
} else note("dept FAB not found");

console.log("\n=== FINDINGS ===");
findings.forEach((f) => console.log(" -", f));
console.log("=== ERRORS ===");
errs.forEach((e) => console.log(" !", e));
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, errs }, null, 1));
await browser.close();
console.log("DONE");
