/* eslint-disable no-console */
// Warm-up: hit every /m route in parallel so Turbopack compiles them all.
// Uses the session cookie extracted by the audit script's login, or just
// warms compile via unauthenticated requests? No — /m requires auth, and a
// redirect still compiles the page? Actually middleware redirects before
// compile. So we need the session cookie. Read it from a cookie file the
// audit writes, else skip auth (compile still happens for the page chunk
// only after middleware passes... in dev, middleware runs first).
import fs from "node:fs";

const BASE = "http://localhost:3000";
const routes = JSON.parse(fs.readFileSync("/tmp/mobile-visitable.json", "utf8"));
const cookie = fs.readFileSync("/tmp/mobile-audit-cookie.txt", "utf8").trim();

const CONCURRENCY = 6;
let i = 0;
const t0 = Date.now();
async function worker() {
  while (i < routes.length) {
    const route = routes[i++];
    const t = Date.now();
    try {
      const res = await fetch(`${BASE}${route}`, {
        headers: { cookie },
        redirect: "manual",
        signal: AbortSignal.timeout(120000),
      });
      console.log(`${route} ${res.status} ${Date.now() - t}ms`);
    } catch (e) {
      console.log(`${route} ERR ${String(e).slice(0, 80)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`WARM DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
