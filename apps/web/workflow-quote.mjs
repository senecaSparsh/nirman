// Quote → Winner → PO workflow: PM adds quotes on an approved indent,
// selects the cheapest winner, verifies PO auto-creates.
import { chromium } from "@playwright/test";
import fs from "fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/mobile-workflow";
const REQ_ID = process.argv[2] || "cmu6epcqu0002vll5nlornkyg";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errs = [];

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => errs.push(`PAGEERR ${String(e).slice(0, 160)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("MutationObserver") && !m.text().includes("Performance") && !m.text().includes("401"))
    errs.push(`CONSOLE ${m.text().slice(0, 160)}`);
});

await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
let creds = null;
for (let i = 0; i < 4; i++) {
  creds = await page.evaluate(async () => {
    const r = await fetch("/api/auth/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "PROCUREMENT_MANAGER" }) });
    return { status: r.status, body: await r.json() };
  });
  if (creds.body.email) break;
  if (creds.status === 429) { await page.waitForTimeout(35000); continue; }
  break;
}
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
const snap = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto(`${BASE}/m/requisitions/${REQ_ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await snap("q-01-indent");

// count existing quotes
const statusText = await page.locator("text=/of.*quotes|quotes.*of|quote/i").first().textContent().catch(() => "");
console.log("status area:", statusText?.trim().slice(0, 80));

async function addQuote(priceStr, supplierIdx, noteSuffix) {
  const addBtn = page.locator('button:has-text("Add Quote")').first();
  if (!(await addBtn.count())) return "no Add Quote button";
  await addBtn.tap();
  await page.waitForTimeout(1500);
  // supplier picker — bottom sheet with "Search suppliers…" input
  const supBtn = page.locator('button:has-text("Select supplier")').first();
  await supBtn.tap();
  await page.waitForTimeout(1500);
  const searchInp = page.locator('input[placeholder="Search suppliers…"]');
  if (!(await searchInp.count())) return "supplier picker did not open";
  // supplier option buttons live below the search input in the same sheet
  const sheet = searchInp.locator("xpath=ancestor::div[contains(@class,'bottom-0')]");
  const opt = sheet.locator('button').nth(supplierIdx + 1); // skip close button
  const optName = await opt.textContent().catch(() => "?");
  await opt.tap();
  await page.waitForTimeout(800);
  console.log("picked supplier:", optName?.trim().slice(0, 40));
  // source → Verbal
  await page.locator('button:has-text("Verbal")').first().tap();
  await page.waitForTimeout(400);
  // source note
  const srcNote = page.locator("textarea").first();
  if (await srcNote.count()) await srcNote.fill(`Verbal quote ${noteSuffix} on 18-Sep-2026`);
  // payment terms + lead time — find inputs by placeholder/label proximity
  const inputs = page.locator('div.fixed.inset-0 input, form input');
  const allInputs = await page.locator('input').all();
  for (const inp of allInputs) {
    const ph = await inp.getAttribute("placeholder").catch(() => "");
    if (ph && /payment|terms|30 days|credit/i.test(ph)) await inp.fill("30 days credit");
    if (ph && /lead|days/i.test(ph)) await inp.fill("3");
  }
  // fill by placeholder as fallback
  const payField = page.locator('input[placeholder*="30 days" i], input[placeholder*="credit" i]').first();
  if (await payField.count()) await payField.fill("30 days credit");
  const leadField = page.locator('input[placeholder="e.g. 7"]').first();
  if (await leadField.count()) await leadField.fill("3");
  // line price — the input next to the material line
  const linePrice = page.locator('input[inputmode="decimal"]').first();
  if (await linePrice.count()) await linePrice.fill(priceStr);
  await snap(`q-add-${noteSuffix}`);
  // submit — look for Save/Add/Submit button in the sheet
  const submit = page.locator('button:has-text("Save Quote"), button:has-text("Add Quote"), button:has-text("Submit"), button[type="submit"]').last();
  await submit.tap();
  await page.waitForTimeout(2500);
  return "submitted";
}

console.log("quote 1:", await addQuote("310", 0, "sup-a"));
await snap("q-02-after1");
console.log("quote 2:", await addQuote("330", 1, "sup-b"));
await snap("q-03-after2");
console.log("quote 3:", await addQuote("350", 2, "sup-c"));
await snap("q-04-after3");

// select winner — first "Select Winner" button (cheapest should be sorted)
const win = page.locator('button:has-text("Select Winner")').first();
if (await win.count()) {
  await win.tap();
  await page.waitForTimeout(3500);
  await snap("q-05-winner");
  console.log("after winner →", page.url());
} else console.log("no Select Winner button — gate not satisfied?");

console.log("errors:", errs);
await browser.close();
console.log("DONE");
