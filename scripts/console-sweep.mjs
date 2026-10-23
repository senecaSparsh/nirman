// Console/network-error sweep — page errors + console.error + 5xx responses
// per route. Usage: node /tmp/console-sweep.mjs [routes...]
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3400";
const routes = process.argv.slice(2);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

let email = "phone+917017988293@nirman.internal", password = "nirman123";
const creds = await page.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
if (creds.ok()) ({ email, password } = await creds.json());
const signin = await page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
if (!signin.ok()) throw new Error("sign-in failed");
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

for (const r of routes) {
  const errs = [], pageerrs = [], net5 = [];
  const onConsole = (m) => { if (m.type() === "error") { const loc = m.location()?.url || ""; errs.push(m.text().slice(0, 100) + " | " + loc.slice(-80)); } };
  const onPage = (e) => pageerrs.push(String(e).slice(0, 200));
  const onResp = (res) => { if (res.status() >= 500 && !/monitoring|sentry|ingest/i.test(res.url())) net5.push(`${res.status()} ${res.url().slice(0, 120)}`); };
  page.on("console", onConsole); page.on("pageerror", onPage); page.on("response", onResp);
  try {
    await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
  } catch (e) { pageerrs.push("NAV " + String(e).slice(0, 80)); }
  page.off("console", onConsole); page.off("pageerror", onPage); page.off("response", onResp);
  const appErrs = errs.filter((e) => !/monitoring|sentry|ingest|telemetry|hydrat|favicon|third-party|clerk/i.test(e));
  if (pageerrs.length || net5.length || appErrs.length) {
    console.log(`❌ ${r}`);
    pageerrs.slice(0,3).forEach((x) => console.log(`   pageerror: ${x}`));
    net5.slice(0,3).forEach((x) => console.log(`   net5xx: ${x}`));
    appErrs.slice(0,3).forEach((x) => console.log(`   console: ${x}`));
  } else {
    console.log(`✅ ${r}`);
  }
}
await browser.close();
