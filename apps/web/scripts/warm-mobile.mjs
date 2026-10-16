// Warm-compile every /m route so the probe doesn't pay cold-compile per page.
const base = process.env.PROBE_BASE ?? "http://localhost:3000";
const demo = await fetch(`${base}/api/auth/demo-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "OWNER" }) });
const { email, password } = await demo.json();
const si = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email, password }), redirect: "manual" });
const cookie = (si.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("cookie-len:", cookie.length);
const src = (await import("node:fs")).readFileSync("e2e/helpers/pages.ts", "utf8");
const block = src.slice(src.indexOf("MOBILE_PAGES"), src.indexOf("];", src.indexOf("MOBILE_PAGES")));
const paths = [...block.matchAll(/\{ path: "([^"]+)"([^}]*)\}/g)].filter((m) => !m[2].includes("skip: true")).map((m) => m[1]).reverse();
console.log("warming", paths.length, "routes");
let done = 0;
const CONC = 6;
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (paths.length) {
      const p = paths.shift();
      const t = Date.now();
      try {
        const res = await fetch(base + p, { headers: { cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" }, redirect: "manual" });
        if (res.status >= 500) console.log(`  ${p} -> ${res.status} (${((Date.now()-t)/1000).toFixed(0)}s)`);
      } catch (e) { console.log(`  ${p} -> FAIL ${e.message?.slice(0,60)}`); }
      if (++done % 15 === 0) console.log(`  ${done} warmed`);
    }
  }),
);
console.log("warm complete");
