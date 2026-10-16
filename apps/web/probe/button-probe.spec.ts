import { test, expect } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_PAGES, MOBILE_PAGES } from "../e2e/helpers/pages";

/**
 * ═══════════════════════════════════════════════════════════════════
 * BUTTON PROBE — Layer 5. Click every safe button on every page.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Page-load smoke proves a route renders; it says nothing about the
 * buttons on it. This probe walks every non-dynamic desktop page,
 * enumerates visible enabled buttons, and clicks the ones that can't
 * plausibly write (write-verbs + type=submit are skipped, not clicked).
 *
 * A click counts as LIVE when ANY observable effect fires within ~900ms:
 *   - overlay appears (dialog/menu/listbox/popover/toast/tooltip)
 *   - URL changes
 *   - the button's own aria/state/class flips (toggles, expanders)
 *   - an /api request fires (a refetch is still "did something")
 *   - focus moves into an input/textarea/select (search-focus buttons)
 *   - DOM shape changes meaningfully (>8 nodes or >2KB html)
 *
 * No effect ⇒ DEAD candidate (reported, not failed — false positives like
 * canvas-controls are possible). A click that fires POST/PUT/PATCH/DELETE
 * is flagged "wrote-immediately" — a UI convention finding, listed for
 * manual cleanup of whatever row it created.
 *
 * Results: console tally + probe/button-report.json.
 */

// Verbs that mutate immediately on click (no confirmation). Skipped — not
// clicked — because this run must stay read-mostly on the dev database.
// Leading boundary only — a trailing \b after a truncated alternate like
// `approv` would never match "Approve"/"Approval" (the 'e' kills the
// boundary). Prefix-matching is the intent: "Endorse" over-skips, which is
// safe; "Approve" under-skipping writes to the DB.
const RISKY_LABEL =
  /\b(delete|remove|void|terminate|execute|approv|reject|submit|pay(?!load)|settle|dispatch|transfer|issu(e|ing)|post(ed)?|complete|confirm|archive|deactivat|lock|unlock|reopen|escalat|process|generate|publish|send|notif|charg|invoice|refund|write.?off|adjust|scrap|sell|sign.?out|log.?out|reset|wipe|purge|backfill|recompute|recalculat|import|migrat|mark|assign|check.?in|check.?out|clock|punch|return|handover|verif|short.?close|final|save|update|create|cancel|clos(e|ing)|end|stop|release|retention|seed|pull|push|two.?way|sync)/i;

// Export affordances whose effect (file download, window.print) is invisible
// to DOM/url signals — clicking still exercises the handler, but "no effect
// seen" can't be called dead.
const UNVERIFIABLE_LABEL = /\b(export|csv|print|download|pdf|excel)\b/i;

// Icon-only buttons: lucide classes that signal a write affordance.
const RISKY_ICON =
  /lucide-(trash|octagon-x|ban|skull|bomb|log-out|power|send|shield-x|eraser|circle-x|square-x)/i;

// Max unique-label clicks per page (row-level repeats collapse by label).
const MAX_CLICKS = 20;
const EFFECT_POLL_MS = 200;
const EFFECT_CAP_MS = 2_500;

// ── Auth ────────────────────────────────────────────────────────────
// PROBE_BASE points at a caller-owned dev server (e.g. `pnpm dev` on :3000)
// where AUTH_BYPASS may be off — authenticate via the demo-login → sign-in
// flow once, then inject the session cookie into every page's context.
// With the spawned :3100 server (AUTH_BYPASS=true) this is skipped.
type Cookie = { name: string; value: string; url: string };
let sessionCookies: Cookie[] = [];

async function fetchSessionCookies(base: string): Promise<Cookie[]> {
  // PROBE_EMAIL/PROBE_PASS: sign in with seeded credentials directly — the
  // path for a production-mode server (demo-login is 403 under NODE_ENV=
  // production, but the seeded credential Account still accepts sign-in).
  let email = process.env.PROBE_EMAIL;
  let password = process.env.PROBE_PASS ?? "nirman123";
  if (!email) {
    const demo = await fetch(`${base}/api/auth/demo-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "OWNER" }),
    });
    if (!demo.ok) throw new Error(`demo-login failed: ${demo.status} (set PROBE_EMAIL/PROBE_PASS for a prod-mode server)`);
    const j = (await demo.json()) as { email: string; password: string };
    email = j.email;
    password = j.password;
  }
  // The auth endpoint rate-limits at 5/min — with 4 parallel workers a
  // retry burst can 429 a sign-in. Retry once after a short backoff.
  let signIn = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  if (signIn.status === 429) {
    await new Promise((r) => setTimeout(r, 12_000));
    signIn = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ email, password }),
      redirect: "manual",
    });
  }
  return (signIn.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair = ""] = c.split(";");
    const [name = "", ...v] = pair.trim().split("=");
    return { name, value: v.join("="), url: base };
  });
}

type BtnInfo = { name: string; index: number };
type Finding = { page: string; button: string; kind: "dead" | "wrote" | "error"; detail?: string };
const findings: Finding[] = [];
// Header/sidebar chrome repeats on every page — probe each labelled control
// once per surface, skip it everywhere else. Keyed per-surface because
// mobile and desktop share label vocabulary but not chrome.
const globalLabelSets = new Map<string, Set<string>>();
// Incremental report — a timeout-killed test restarts the worker and wipes
// module state, so each page appends its own line instead of relying on
// afterAll. Append-only: truncation must happen outside (rm before run) —
// a mid-run worker restart would otherwise wipe earlier pages' lines.
const REPORT_JSONL = join(__dirname, "button-report.jsonl");
function reportLine(obj: unknown) {
  appendFileSync(REPORT_JSONL, JSON.stringify(obj) + "\n");
}
const pageStats: { page: string; buttons: number; clicked: number; live: number; dead: number; risky: number }[] = [];

async function snapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const html = document.body?.innerHTML ?? "";
    // Cheap djb2 — catches text-only rerenders (currency/toggle flips) that
    // node-count and length deltas miss.
    let hash = 5381;
    for (let i = 0; i < html.length; i += 7) hash = ((hash << 5) + hash + html.charCodeAt(i)) | 0;
    return {
      url: location.href,
      nodes: document.querySelectorAll("*").length,
      htmlLen: html.length,
      hash,
      htmlClass: document.documentElement.className,
      dataNav: document.documentElement.getAttribute("data-nav"),
      activeTag: (document.activeElement as HTMLElement | null)?.tagName ?? "",
      overlay: !!document.querySelector(
        '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper],[data-sonner-toast],[role="tooltip"],[data-state="open"]',
      ),
    };
  });
}

async function btnAttrs(btn: import("@playwright/test").Locator | import("@playwright/test").ElementHandle) {
  return {
    expanded: await btn.getAttribute("aria-expanded"),
    pressed: await btn.getAttribute("aria-pressed"),
    state: await btn.getAttribute("data-state"),
    cls: (await btn.getAttribute("class")) ?? "",
    type: await btn.getAttribute("type"),
  };
}

async function recover(
  page: import("@playwright/test").Page,
  basePath: string,
  urlChanged: boolean,
  overlayOpen: boolean,
) {
  if (urlChanged) {
    // Full settle — the next click targets DOM indexes on this page, so the
    // page must have actually rendered its buttons before we continue.
    await page.goto(basePath, { waitUntil: "domcontentloaded" }).catch(() => {});
    return;
  }
  if (!overlayOpen) return;
  // Close whatever opened — Escape handles radix dialogs/menus/popovers.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(120);
  await page.keyboard.press("Escape").catch(() => {});
  // A sheet/drawer may need its own close button.
  const closer = page
    .locator('[role="dialog"] button, [data-state="open"] button')
    .filter({ hasText: /cancel|close|done|dismiss/i })
    .first();
  if (await closer.isVisible().catch(() => false)) {
    await closer.click({ timeout: 1_000 }).catch(() => {});
  }
  // Still open? Click the scrim — side sheets close on outside-click, and a
  // lingering panel intercepts every later click on the header buttons.
  // Desktop: bottom-center (x=5 hits the sidebar rail). Mobile: top-center —
  // bottom sheets cover the bottom half and the tab bar lives there too.
  const stillOpen = await page
    .locator('[role="dialog"], [role="alertdialog"], [data-state="open"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (stillOpen) {
    const vp = page.viewportSize() ?? { width: 1280, height: 720 };
    const y = vp.width < 768 ? 150 : vp.height - 15;
    await page.mouse.click(vp.width / 2, y).catch(() => {});
    await page.waitForTimeout(150);
  }
}

type PageEntry = { path: string; skip?: boolean };

/**
 * Probe one page: every safe button gets clicked and classified
 * live/dead/wrote/error. `surface` ("desktop"|"mobile") scopes the
 * cross-page chrome-label dedupe — /m and desktop share label vocabulary
 * but have different chrome.
 */
async function probePage(page: import("@playwright/test").Page, entry: PageEntry, surface: string) {
  const seenGlobal = globalLabelSets.get(surface) ?? new Set<string>();
  globalLabelSets.set(surface, seenGlobal);
  const stats = { page: entry.path, buttons: 0, clicked: 0, live: 0, dead: 0, risky: 0 };
  const findingsBefore = findings.length;
  if (sessionCookies.length) await page.context().addCookies(sessionCookies);
  // domcontentloaded, not networkidle — the dev server's HMR socket and
  // late chunk/font streams keep networkidle waiting ~10-30s/page. The
  // render marker is the real "page is up" signal.
  await page.goto(entry.path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main, h1, [data-noaccess], [role='alert']", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(500); // hydration settle — buttons become interactive

  // Sonner toasts stack top-right — exactly over the header buttons —
  // and their cards intercept pointer events. A style tag (not a one-off
  // evaluate) so toasts spawned mid-probe can't re-block clicks.
  await page
    .addStyleTag({ content: "[data-sonner-toaster],[data-sonner-toast]{pointer-events:none!important}" })
    .catch(() => {});

  // A rendered page has an h1 (or a NoAccess block on restricted roles).
  // Mobile pages don't use <h1> — the phone shell marks success with a
  // non-empty <main>. Poll up to 8s: a production build streams the shell
  // instantly and fills content later — a single early snapshot reads an
  // empty <main> and flags a healthy page.
  let rendered = false;
  for (let t = 0; t < 8_000 && !rendered; t += 400) {
    const hasH1 = await page.locator("h1").first().isVisible().catch(() => false);
    const hasNoAccess = await page.getByText(/isn.t part of your role/i).first().isVisible().catch(() => false);
    const mobileRendered =
      surface === "mobile" &&
      (await page.locator("main").first().isVisible().catch(() => false)) &&
      (await page.locator("main").first().innerText().catch(() => "")).trim().length > 20;
    rendered = hasH1 || hasNoAccess || mobileRendered;
    if (!rendered) await page.waitForTimeout(400);
  }
  if (!rendered) {
    findings.push({ page: entry.path, button: "(page)", kind: "error", detail: "no h1/NoAccess — page did not render" });
    pageStats.push(stats);
    reportLine({ surface, page: entry.path, stats, findings: findings.slice(findingsBefore) });
    return;
  }

  // Enumerate visible, enabled buttons. Click via ElementHandle — the
  // element's identity, not its index — because earlier clicks mutate
  // the DOM and an nth(i) that drifted onto a DIFFERENT button once
  // landed on "Approve" (a real write). Handles go stale only across
  // navigation; re-enumerate after each nav-away and let the label
  // dedupes skip what's already probed.
  const buttons = page.locator('button:visible:not([disabled]):not([aria-disabled="true"])');
  let handles = await buttons.elementHandles();
  const count = handles.length;
  stats.buttons = count;

  const seenLabels = new Set<string>();
  let clicks = 0;
  let consecutiveIntercepts = 0;
  let navAways = 0;
  // Per-page budget — a stuck overlay must not let 20 consecutive click
  // timeouts eat the 180s test cap. Bail out and record what we have.
  const deadline = Date.now() + 75_000;

  let i = 0;
  while (i < handles.length && clicks < MAX_CLICKS) {
    if (Date.now() > deadline) {
      findings.push({ page: entry.path, button: "(page)", kind: "error", detail: `budget exceeded at button ${i}/${handles.length}` });
      break;
    }
    // Circuit breaker — repeated intercepts mean a scrim/overlay is stuck
    // over the page; reload it once rather than timing out the rest.
    if (consecutiveIntercepts >= 2) {
      consecutiveIntercepts = 0;
      await page.goto(entry.path, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
      handles = await buttons.elementHandles().catch(() => []);
      i = 0;
      continue;
    }
    const btn = handles[i++];
    if (!btn) break;
    if (!(await btn.isVisible().catch(() => false))) continue;

    // nextjs-portal = the dev-overlay widget. Playwright's css engine
    // pierces shadow DOM so its buttons match `button`; clicking it opens
    // a popover that then intercepts every later click. Not app UI — skip
    // (closest() doesn't cross shadow boundaries, so walk getRootNode).
    const insideDevOverlay = await btn.evaluate((el: Element) => {
      let node: Node | null = el;
      while (node) {
        const tag = (node as Element).tagName?.toLowerCase?.();
        if (tag === "nextjs-portal" || tag === "nextjs-route-announcer") return true;
        node = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
      }
      return false;
    });
    if (insideDevOverlay) continue;

    // Every handle read can die mid-navigation (a previous click's nav
    // completing now). A null attrs = detached — re-enumerate.
    const label =
      ((await btn.getAttribute("aria-label").catch(() => null)) || (await btn.innerText().catch(() => "")) || (await btn.getAttribute("title").catch(() => null)) || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || `icon-btn#${i - 1}`;
    const html = await btn.innerHTML().catch(() => "");
    const attrs = await btnAttrs(btn).catch(() => null);
    if (!attrs) { handles = await buttons.elementHandles().catch(() => []); i = 0; continue; }

    // Never submit a form, never click a write-verb.
    if (attrs.type === "submit" || RISKY_LABEL.test(label) || RISKY_ICON.test(html)) {
      stats.risky++;
      continue;
    }
    // Already-active nav/tab — a no-op click by design, not a dead button.
    if (
      (await btn.getAttribute("aria-current")) ||
      (await btn.getAttribute("aria-selected")) === "true" ||
      attrs.state === "active"
    ) {
      continue;
    }
    // Collapse row-level repeats: same label on the page = same affordance.
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    // Collapse chrome repeats across pages: same label already probed.
    if (seenGlobal.has(label)) continue;
    seenGlobal.add(label);

    const before = await snapshot(page);
    let wrote = false;
    let apiHit = false;
    let downloaded = false;
    let popupOpened = false;
    const onReq = (r: import("@playwright/test").Request) => {
      if (!r.url().includes("/api/")) return;
      apiHit = true;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method())) wrote = true;
    };
    const onDl = () => { downloaded = true; };
    const onPopup = () => { popupOpened = true; };
    page.on("request", onReq);
    page.on("download", onDl);
    page.on("popup", onPopup);
    clicks++;
    stats.clicked++;

    try {
      await btn.click({ timeout: 3_000 });
      consecutiveIntercepts = 0;
    } catch {
      page.off("request", onReq);
      page.off("download", onDl);
      page.off("popup", onPopup);
      consecutiveIntercepts++;
      findings.push({ page: entry.path, button: label, kind: "error", detail: "click intercepted / timed out" });
      continue;
    }

    // Poll for an observable effect — controlled tabs (role=tab driven
    // by ?tab= router.push) flip aria-selected only after the RSC
    // round-trip, which dev-compiles well past a fixed 900ms window.
    let after = before;
    let urlChanged = false;
    let live = apiHit || downloaded || popupOpened;
    for (let t = 0; t < EFFECT_CAP_MS && !live; t += EFFECT_POLL_MS) {
      await page.waitForTimeout(EFFECT_POLL_MS);
      after = await snapshot(page);
      const attrsAfter = await btnAttrs(btn).catch(() => null);
      urlChanged = after.url !== before.url;
      const selfFlipped =
        attrsAfter &&
        (attrsAfter.expanded !== attrs.expanded ||
          attrsAfter.pressed !== attrs.pressed ||
          attrsAfter.state !== attrs.state ||
          attrsAfter.cls !== attrs.cls);
      const domShift =
        Math.abs(after.nodes - before.nodes) > 8 ||
        after.hash !== before.hash ||
        after.htmlClass !== before.htmlClass ||
        after.dataNav !== before.dataNav;
      const focusMoved =
        after.activeTag !== before.activeTag &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(after.activeTag);
      live =
        urlChanged || after.overlay || selfFlipped || apiHit || focusMoved || domShift || downloaded || popupOpened;
    }
    page.off("request", onReq);
    page.off("download", onDl);
    page.off("popup", onPopup);

    if (wrote) {
      findings.push({ page: entry.path, button: label, kind: "wrote", detail: "fired a mutation request on click — verify + clean up" });
    }
    if (live) {
      stats.live++;
    } else if (UNVERIFIABLE_LABEL.test(label)) {
      // Download/print affordance — effect invisible to our signals.
      // Recorded as live-ish: the handler ran without crashing.
      stats.live++;
    } else {
      stats.dead++;
      findings.push({ page: entry.path, button: label, kind: "dead" });
    }

    if (urlChanged) {
      navAways++;
      // Back on the page — re-enumerate handles (old ones detached) and
      // rescan from the top; label dedupes skip what's already probed.
      // Nav-heavy pages (rows of link-buttons) would burn the whole test
      // timeout in recovery gotos — cap the round-trips.
      if (navAways > 8) {
        findings.push({ page: entry.path, button: "(page)", kind: "error", detail: "nav-heavy — >8 link navigations, remaining buttons unprobed" });
        break;
      }
      await page.goto(entry.path, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
      handles = await buttons.elementHandles().catch(() => []);
      i = 0;
      continue;
    }
    await recover(page, entry.path, urlChanged, after.overlay);
  }

  pageStats.push(stats);
  reportLine({ surface, page: entry.path, stats, findings: findings.slice(findingsBefore) });
  const noCrash = await page.getByText(/something went wrong/i).isHidden().catch(() => true);
  expect(noCrash, `${entry.path} crashed during probing`).toBeTruthy();
}

function registerProbeSuite(surface: "desktop" | "mobile", entries: PageEntry[]) {
  test.describe(`button probe — ${surface} @probe-${surface}`, () => {
    if (surface === "mobile") {
      // Mobile pages render the phone shell — the viewport + touch flag are
      // what make it real; the UA also stops middleware from bouncing a
      // desktop-shaped request onto a different route.
      test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
    }
    test.beforeAll(async () => {
      if (process.env.PROBE_BASE) {
        sessionCookies = await fetchSessionCookies(process.env.PROBE_BASE);
        if (!sessionCookies.length) throw new Error("PROBE_BASE auth produced no cookies");
      }
    });
    for (const entry of entries) {
      test(`${entry.path} — safe buttons respond`, async ({ page }) => {
        await probePage(page, entry, surface);
      });
    }

    test.afterAll(async () => {
      const totals = pageStats.reduce(
        (a, s) => ({
          buttons: a.buttons + s.buttons,
          clicked: a.clicked + s.clicked,
          live: a.live + s.live,
          dead: a.dead + s.dead,
          risky: a.risky + s.risky,
        }),
        { buttons: 0, clicked: 0, live: 0, dead: 0, risky: 0 },
      );
      console.log(`\n═══ BUTTON PROBE SUMMARY (${surface}) ═══`);
      for (const s of pageStats) {
        if (s.dead || s.clicked === 0) {
          console.log(`  ${s.page.padEnd(46)} btn=${s.buttons} clicked=${s.clicked} live=${s.live} dead=${s.dead} risky=${s.risky}`);
        }
      }
      console.log(`\n  pages=${pageStats.length}  buttons=${totals.buttons}  clicked=${totals.clicked}  live=${totals.live}  dead=${totals.dead}  risky-skipped=${totals.risky}`);
      const dead = findings.filter((f) => f.kind === "dead");
      const wrote = findings.filter((f) => f.kind === "wrote");
      const errors = findings.filter((f) => f.kind === "error");
      if (dead.length) {
        console.log(`\n  DEAD CANDIDATES (${dead.length}):`);
        for (const f of dead) console.log(`    ${f.page}  [${f.button}]`);
      }
      if (wrote.length) {
        console.log(`\n  WROTE-IMMEDIATELY (${wrote.length}) — clicked a non-risky label but a mutation fired:`);
        for (const f of wrote) console.log(`    ${f.page}  [${f.button}]`);
      }
      if (errors.length) {
        console.log(`\n  ERRORS (${errors.length}):`);
        for (const f of errors) console.log(`    ${f.page}  [${f.button}] ${f.detail ?? ""}`);
      }
      console.log(`  (incremental report: ${REPORT_JSONL})`);
    });
  });
}

registerProbeSuite("desktop", DESKTOP_PAGES.filter((e) => !e.skip));
registerProbeSuite("mobile", MOBILE_PAGES.filter((e) => !e.skip));

