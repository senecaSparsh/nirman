/**
 * ui-sweep.mjs — automated visual defect sweep over every page.
 *
 * Visits every route in e2e/helpers/pages.ts, screenshots pages with
 * findings, and prints a defect report. Self-authenticates via the
 * demo-login → better-auth flow (dev only).
 *
 * Usage:  node scripts/ui-sweep.mjs [--mobile] [--all-shots]
 * Requires: dev server on :3000 with AUTH_BYPASS unset-or-any (uses real sign-in).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

function extractPages(source, constName) {
  const start = source.indexOf(`export const ${constName}`);
  const end = source.indexOf("];", start);
  const block = source.slice(start, end);
  return [...block.matchAll(/\{ path: "([^"]+)"([^}]*)\}/g)].map((m) => ({
    path: m[1],
    skip: /skip: true/.test(m[2]),
  }));
}
const pagesSrc = readFileSync(new URL("../e2e/helpers/pages.ts", import.meta.url), "utf8");
const DESKTOP_PAGES = extractPages(pagesSrc, "DESKTOP_PAGES");
const MOBILE_PAGES = extractPages(pagesSrc, "MOBILE_PAGES");

const BASE = process.env.SWEEP_BASE ?? "http://localhost:3000";
const OUT = new URL("../../../.playwright-mcp/sweep/", import.meta.url).pathname;
const ONLY_MOBILE = process.argv.includes("--mobile");
const ALL_SHOTS = process.argv.includes("--all-shots");

mkdirSync(OUT, { recursive: true });

const findings = [];

async function authenticate(context) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "OWNER" }),
  });
  if (!res.ok) throw new Error(`demo-login ${res.status}`);
  const { email, password } = await res.json();
  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookies = signIn.headers.getSetCookie?.() ?? [];
  const cookies = setCookies.map((c) => {
    const [pair, ...attrs] = c.split(";").map((s) => s.trim());
    const [name, value] = pair.split("=");
    return {
      name, value, domain: "localhost", path: "/",
      httpOnly: attrs.some((a) => a.toLowerCase() === "httponly"),
      secure: false, sameSite: "Lax",
    };
  });
  if (!cookies.length) throw new Error("sign-in returned no cookies");
  await context.addCookies(cookies);
}

const DOM_CHECK = `(() => {
  const out = { overflowX: false, clipped: [], badText: [], emptyMain: false };
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 8) out.overflowX = true;
  const main = document.querySelector('main, [role="main"], #main-content');
  if (main && main.textContent.trim().length < 20 && !main.querySelector('canvas,svg,img')) out.emptyMain = true;
  const els = document.querySelectorAll('body *');
  for (const el of els) {
    if (el.children.length) continue;
    const t = el.textContent?.trim();
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (/\\bNaN\\b|\\bundefined\\b|\\[object Object\\]|\\+\\+₹|(^|[^\\d])-\\d+\\s?d\\b/.test(t)) out.badText.push(t.slice(0, 60));
    // clipped at viewport right edge while overflow:visible, outside any scrollable ancestor
    const cs = getComputedStyle(el);
    let anc = el.parentElement, scrollable = false;
    while (anc && anc !== document.body) {
      const oc = getComputedStyle(anc).overflowX;
      if (oc === 'auto' || oc === 'scroll') { scrollable = true; break; }
      anc = anc.parentElement;
    }
    if (!scrollable && r.right > vw + 8 && cs.overflow === 'visible' && !el.closest('.truncate,[class*="truncate"],[class*="line-clamp"]')) {
      out.clipped.push(t.slice(0, 50));
    }
  }
  out.badText = out.badText.slice(0, 4);
  out.clipped = [...new Set(out.clipped)].slice(0, 4);
  return out;
})()`;

async function sweep(list, label, width, height) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await authenticate(context);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  let n = 0;
  for (const { path, skip } of list) {
    if (skip) continue;
    n++;
    const t0 = Date.now();
    const issues = [];
    const onConsole = (m) => { if (m.type() === "error") issues.push(`console: ${m.text().slice(0, 80)}`); };
    const onPageError = (e) => issues.push(`pageerror: ${String(e).slice(0, 80)}`);
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      const status = res?.status() ?? 0;
      if (status >= 400) issues.push(`HTTP ${status}`);
      await page.waitForTimeout(1500);
      if (!page.url().startsWith(`${BASE}${path}`)) await page.waitForTimeout(2000);
      const dom = await page.evaluate(DOM_CHECK);
      if (dom.overflowX) issues.push("horizontal page overflow");
      if (dom.emptyMain) issues.push("empty main content");
      for (const c of dom.clipped) issues.push(`clipped: "${c}"`);
      for (const b of dom.badText) issues.push(`bad text: "${b}"`);
      if (issues.length || ALL_SHOTS) {
        const name = `${label}${path.replaceAll("/", "_") || "_root"}.png`;
        await page.screenshot({ path: `${OUT}${name}`, fullPage: false });
      }
      if (issues.length) findings.push({ path, issues: [...new Set(issues)].slice(0, 6) });
    } catch (e) {
      const msg = String(e);
      issues.push(msg.includes("ERR_CONNECTION_REFUSED") ? "server down" : `crash: ${msg.slice(0, 100)}`);
      findings.push({ path, issues });
      if (issues.includes("server down")) {
        process.stdout.write(`\nserver down at ${path} — waiting 30s for respawn\n`);
        await new Promise((r) => setTimeout(r, 30000));
      }
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      writeFileSync(`${OUT}report.json`, JSON.stringify(findings, null, 2));
      process.stdout.write(`\r${label} ${n}/${list.length} ${path} ${Date.now() - t0}ms${issues.length ? ` [${issues.length}]` : ""}\n`);
    }
  }
  errors[label] = findings.length;
  await browser.close();
}

if (!ONLY_MOBILE) await sweep(DESKTOP_PAGES, "d_", 1440, 900);
await sweep(MOBILE_PAGES, "m_", 390, 844);

writeFileSync(`${OUT}report.json`, JSON.stringify(findings, null, 2));
console.log(`\n═══ SWEEP COMPLETE — ${findings.length} pages flagged ═══`);
for (const f of findings) console.log(`${f.path}\n  ${f.issues.join("\n  ")}`);
