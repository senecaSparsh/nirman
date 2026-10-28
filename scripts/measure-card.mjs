import { chromium } from "playwright";
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
await page.goto(`${BASE}/m/stock`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(2000);

const out = await page.evaluate(() => {
  const probe = [...document.querySelectorAll("*")].find((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === "Coarse River Sand"));
  if (!probe) return { error: "row not found" };
  // walk up to the card-like container (has border radius or shadow or is a button/a)
  let row = probe;
  for (let i = 0; i < 6; i++) {
    const s = getComputedStyle(row);
    if (row.tagName === "A" || row.tagName === "BUTTON" || s.borderRadius !== "0px" || s.boxShadow !== "none") break;
    row = row.parentElement;
  }
  const r = (el) => el ? JSON.parse(JSON.stringify(el.getBoundingClientRect())) : null;
  const cs = (el) => { const s = getComputedStyle(el); return {
    pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(" "),
    gap: s.gap, radius: s.borderRadius, border: `${s.borderWidth} ${s.borderStyle} ${s.borderColor}`,
    fs: s.fontSize, lh: s.lineHeight, fw: s.fontWeight,
    minH: s.minHeight, display: s.display, align: s.alignItems,
    bg: s.backgroundColor, color: s.color, shadow: s.boxShadow?.slice(0, 90),
  };};
  const walk = (el, d = 0) => d > 2 ? [] : [{ tag: el.tagName, cls: String(el.className).slice(0, 70), rect: r(el), cs: cs(el), kids: [...el.children].flatMap((c) => walk(c, d + 1)) }];
  const siblings = row.parentElement?.children.length ?? 0;
  return { chain: walk(row), tag: row.tagName, role: row.getAttribute("role"), siblings,
    html: row.outerHTML.slice(0, 1500),
    parentCS: cs(row.parentElement), pageBg: getComputedStyle(document.body).backgroundColor };
});
console.log(JSON.stringify(out, null, 1).slice(0, 9000));
await browser.close();
