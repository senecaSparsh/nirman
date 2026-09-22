import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
const errs = [];
page.on("pageerror", (e) => errs.push(`JS:${e.message.slice(0,100)}`));
page.on("console", (m) => { if (m.type() === "error") errs.push(`CONSOLE:${m.text().slice(0,100)}`); });
await page.goto("https://nirman.life/sign-in", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
await page.screenshot({ path: "/tmp/mobile-workflow/live-signin-debug.png" });
const formState = await page.evaluate(() => {
  const form = document.querySelector("form");
  const phone = document.querySelector("input[type=tel]");
  const pw = document.querySelector("input[type=password]");
  const btn = document.querySelector("button[type=submit]");
  return {
    form: !!form, phone: !!phone, pw: !!pw, btn: !!btn,
    btnText: btn?.textContent.trim(), btnDisabled: btn?.disabled,
    phoneVisible: phone ? getComputedStyle(phone).display !== "none" : false,
    pwVisible: pw ? getComputedStyle(pw).display !== "none" : false,
  };
});
console.log("form:", JSON.stringify(formState));
console.log("errors:", JSON.stringify(errs.slice(0, 8)));
await b.close();
