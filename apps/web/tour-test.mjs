/* eslint-disable no-console */
// Tour + dept-FAB interaction test: real sign-in, drive the product tour
// through every step, then exercise the fan (open → chip nav → close).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/tour-test";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errs = [];

async function signIn(role) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(40000);
  page.on("pageerror", (e) => errs.push(`${role}: ${String(e).slice(0, 160)}`));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 45000 });
      break;
    } catch {
      console.log(`${role}: sign-in nav attempt ${attempt + 1} failed, retrying`);
      await page.waitForTimeout(8000);
    }
  }
  await page.waitForTimeout(3000);
  const creds = await page.evaluate(async (r) => {
    const res = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: r }),
    });
    return res.json();
  }, role);
  await page.getByRole("button", { name: /^Email$/ }).first().click();
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 45000 });
  return { ctx, page };
}

for (const role of ["OWNER", "SITE_ENGINEER"]) {
  const { ctx, page } = await signIn(role);
  console.log(`${role}: signed in`);

  await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Force-start the tour regardless of persisted state.
  await page.evaluate(() => {
    localStorage.removeItem("nirman-tour-v1");
    window.dispatchEvent(new Event("nirman:start-tour"));
  });

  // Wait for either the welcome sheet (Start tour) or a running step card.
  const welcome = page.getByRole("button", { name: "Start tour" });
  const stepCard = page.locator('div[role="dialog"][aria-label]');
  await Promise.race([
    welcome.waitFor({ state: "visible", timeout: 20000 }),
    stepCard.first().waitFor({ state: "visible", timeout: 20000 }),
  ]).catch(() => console.log(`${role}: tour never appeared`));
  await page.screenshot({ path: `${OUT}/${role}-t0.png` });

  if (await welcome.isVisible().catch(() => false)) {
    await welcome.click();
  }

  // Walk every step — the card carries the step title as aria-label.
  for (let i = 0; i < 10; i++) {
    const card = page.locator('div[role="dialog"][aria-label]').first();
    try {
      await card.waitFor({ state: "visible", timeout: 20000 });
    } catch {
      console.log(`${role}: step ${i + 1} — no card, tour ended`);
      break;
    }
    await page.waitForTimeout(1200); // spotlight settle / route push
    const title = await card.getAttribute("aria-label");
    const counter = (await card.locator("span").first().textContent())?.trim();
    const ring = await page.evaluate(() =>
      [...document.querySelectorAll("div")].some((d) =>
        (d.style.boxShadow || "").includes("9999px"),
      ),
    );
    console.log(`${role}: step ${counter} "${title}" ring=${ring} url=${new URL(page.url()).pathname}`);
    await page.screenshot({ path: `${OUT}/${role}-t${i + 1}-${(title || "step").replace(/\W+/g, "-").slice(0, 30)}.png` });
    const next = card.getByRole("button", { name: /Next|Done/ });
    const isDone = (await next.first().textContent())?.includes("Done");
    await next.first().click();
    if (isDone) break;
  }

  // ── FAB fan ──
  await page.goto(`${BASE}/m/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  // Ensure no overlay is up (tour welcome re-arms on state:null before PUT lands)
  await page.waitForFunction(
    () => ![...document.querySelectorAll("div")].some(
      (d) => d.className.includes("fixed inset-0") && getComputedStyle(d).zIndex !== "auto" && d.clientHeight > 0,
    ),
    { timeout: 15000 },
  ).catch(() => {});
  const fab = page.locator('button[aria-label="More departments"]');
  console.log(`${role}: FAB count=${await fab.count()}`);
  if (await fab.count()) {
    await fab.click();
    await page.waitForTimeout(900);
    const chips = await page.locator(".dept-fan-chip").allTextContents();
    console.log(`${role}: fan chips=[${chips.join(", ")}]`);
    await page.screenshot({ path: `${OUT}/${role}-fan.png` });
    const firstChip = page.locator("a.dept-fan-chip").first();
    const chipHref = await firstChip.getAttribute("href");
    await firstChip.click();
    await page.waitForTimeout(1500);
    const landed = new URL(page.url()).pathname;
    console.log(`${role}: chip -> ${chipHref} landed=${landed} ${landed === chipHref ? "OK" : "MISMATCH"}`);
    await page.screenshot({ path: `${OUT}/${role}-fan-nav.png` });
  }
  await ctx.close();
}

await browser.close();
if (errs.length) {
  console.log("\nPAGE ERRORS:");
  errs.forEach((e) => console.log("  " + e));
} else {
  console.log("\nNo page errors.");
}
console.log("done");
