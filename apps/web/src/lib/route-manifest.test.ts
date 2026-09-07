import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ROUTES,
  ROUTE_BY_PATH,
  PERSONA_TAB_PATHS,
  matchRoute,
  upHref,
  breadcrumbs,
  activeTabFor,
  titleFor,
  tabsFor,
  menuFor,
  canAccess,
  permFor,
  badgeEndpointsFor,
  searchableFor,
  relatedTo,
  SEARCH_INDEX,
  type RouteEntry,
  type NavContext,
} from "@/lib/route-manifest";
import { ALL_PERMISSIONS, effectivePermissions, type Role } from "@/lib/roles";
import type { Persona } from "@/lib/mobile-nav-v2";

/* ═══════════════════════════════════════════════════════════════════════════
   ROUTE MANIFEST GUARDS

   These tests exist to make navigation drift IMPOSSIBLE rather than merely
   discouraged. Before the manifest, navigation lived in six hand-maintained
   maps across three files: 46 of 121 real static routes had fallen out of
   them, and 17 were reachable only by typing the URL.

   G6-G8 additionally hold for ARBITRARY permission sets, not just the seven
   personas — because permissions are granted per user (UserPermission), so
   the real population of access patterns is 2^n, not 7.

   See docs/NAVIGATION.md §4.1.
   ═══════════════════════════════════════════════════════════════════════════ */

const APP_M = path.resolve(__dirname, "../app/m");
const PERSONAS: Persona[] = [
  "executive", "ops", "procurement", "field", "sales", "finance", "hr",
];
const PERSONA_ROLE: Record<Persona, Role> = {
  executive: "OWNER",
  ops: "PROJECT_MANAGER",
  procurement: "PROCUREMENT_MANAGER",
  field: "SITE_ENGINEER",
  sales: "SALES_MANAGER",
  finance: "ACCOUNTANT",
  hr: "HR_MANAGER",
};
const ctxFor = (persona: Persona, extra: string[] = []): NavContext => ({
  persona,
  permissions: effectivePermissions(PERSONA_ROLE[persona], extra),
});

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** Every route that physically exists on disk. */
function routesOnDisk(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") {
        const rel = path.relative(APP_M, path.dirname(p)).split(path.sep).join("/");
        out.push(rel ? `/m/${rel}` : "/m");
      }
    }
  })(APP_M);
  return out.sort();
}

/** component name -> routes that import it. */
function sharedListComponents(): Map<string, Set<string>> {
  const byComponent = new Map<string, Set<string>>();
  const routeOf = (file: string): string | null => {
    let d = path.dirname(file);
    while (d.startsWith(APP_M)) {
      if (fs.existsSync(path.join(d, "page.tsx"))) {
        const rel = path.relative(APP_M, d).split(path.sep).join("/");
        return rel ? `/m/${rel}` : "/m";
      }
      d = path.dirname(d);
    }
    return null;
  };
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith(".tsx")) continue;
      const route = routeOf(p);
      if (!route) continue;
      const src = fs.readFileSync(p, "utf8");
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
        for (const raw of m[1]!.split(",")) {
          const name = raw.trim().split(" as ")[0]!.trim();
          // Skeletons are shared chrome, not a domain list.
          if (!/^Mobile\w*List$/.test(name) || name.includes("Skeleton")) continue;
          if (!byComponent.has(name)) byComponent.set(name, new Set());
          byComponent.get(name)!.add(route);
        }
      }
    }
  })(APP_M);
  return byComponent;
}

/** Hops from `route` up to the nearest tab root for `persona`, or Infinity. */
function hopsToTabRoot(route: RouteEntry, persona: Persona): number {
  const tabs = new Set(PERSONA_TAB_PATHS[persona]);
  let cur: RouteEntry | undefined = route;
  let hops = 0;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.path)) {
    if (tabs.has(cur.path)) return hops;
    seen.add(cur.path);
    cur = cur.parent ? ROUTE_BY_PATH.get(cur.parent) : undefined;
    hops++;
  }
  return Infinity;
}

// ── G1 ────────────────────────────────────────────────────────────────────
describe("G1 — manifest covers the route tree exactly", () => {
  const disk = routesOnDisk();

  it("every page.tsx has a manifest entry", () => {
    const missing = disk.filter((p) => !ROUTE_BY_PATH.has(p));
    expect(missing, `Add these to ROUTES in route-manifest.ts:\n${missing.join("\n")}`)
      .toEqual([]);
  });

  it("every manifest entry has a page.tsx", () => {
    const diskSet = new Set(disk);
    const stale = ROUTES.filter((r) => !diskSet.has(r.path)).map((r) => r.path);
    expect(stale, `Remove these from ROUTES (no page.tsx):\n${stale.join("\n")}`)
      .toEqual([]);
  });

  it("has no duplicate paths", () => {
    const seen = new Set<string>();
    const dupes = ROUTES.filter((r) => seen.has(r.path) || (seen.add(r.path), false));
    expect(dupes.map((r) => r.path)).toEqual([]);
  });
});

// ── G2 ────────────────────────────────────────────────────────────────────
describe("G2 — everything is reachable", () => {
  it("every route is ≤3 hops from a tab root for at least one persona", () => {
    const unreachable = ROUTES
      .filter((r) => r.kind !== "redirect")
      .map((r) => ({
        path: r.path,
        best: Math.min(...PERSONAS.map((p) => hopsToTabRoot(r, p))),
      }))
      .filter((r) => r.best > 3);
    expect(
      unreachable,
      `These routes are buried too deep (or orphaned) — give them a closer ` +
      `parent or add a tab root:\n${unreachable.map((u) => `${u.path} (${u.best})`).join("\n")}`,
    ).toEqual([]);
  });

  it("no route is orphaned from the parent graph", () => {
    const orphans = ROUTES
      .filter((r) => r.parent !== null && !ROUTE_BY_PATH.has(r.parent))
      .map((r) => `${r.path} -> ${r.parent}`);
    expect(orphans, `Parent does not exist:\n${orphans.join("\n")}`).toEqual([]);
  });
});

// ── G3 ────────────────────────────────────────────────────────────────────
describe("G3 — exactly one tab is active, always", () => {
  it("every persona has Home as tab 1", () => {
    // Home is the only root of the parent graph, so a Home tab is what makes
    // "exactly one active tab" hold universally with no exception list.
    for (const persona of PERSONAS) {
      expect(PERSONA_TAB_PATHS[persona][0], persona).toBe("/m/home");
    }
  });

  it("every persona's tab roots exist and are not redirects", () => {
    const bad: string[] = [];
    for (const persona of PERSONAS) {
      for (const p of PERSONA_TAB_PATHS[persona]) {
        const entry = ROUTE_BY_PATH.get(p);
        if (!entry) bad.push(`${persona}: ${p} is not in ROUTES`);
        else if (entry.kind === "redirect") bad.push(`${persona}: ${p} is a redirect stub`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("resolves exactly one active tab for every route the user can open", () => {
    const failures: string[] = [];
    for (const persona of PERSONAS) {
      const ctx = ctxFor(persona);
      for (const r of ROUTES) {
        if (r.kind === "redirect") continue;
        if (!canAccess(r, ctx.permissions)) continue;
        const active = activeTabFor(r.path, ctx);
        if (!active) { failures.push(`${persona} @ ${r.path}: no tab active`); continue; }
        if (!tabsFor(ctx).some((t) => t.path === active)) {
          failures.push(`${persona} @ ${r.path}: active tab "${active}" is not in their tab bar`);
        }
      }
    }
    expect(failures, `${failures.length} failures:\n${failures.slice(0, 30).join("\n")}`)
      .toEqual([]);
  });

  it("a tab root resolves to itself", () => {
    for (const persona of PERSONAS) {
      const ctx = ctxFor(persona);
      for (const tab of tabsFor(ctx)) {
        expect(activeTabFor(tab.path, ctx), `${persona} @ ${tab.path}`).toBe(tab.path);
      }
    }
  });
});

// ── G4 ────────────────────────────────────────────────────────────────────
describe("G4 — the parent graph is sound", () => {
  it("parent is a strict path ancestor or a hub", () => {
    const bad = ROUTES.filter((r) => {
      if (r.parent === null) return false;
      if (r.path.startsWith(r.parent + "/")) return false;
      return ROUTE_BY_PATH.get(r.parent)?.kind !== "hub";
    }).map((r) => `${r.path} -> ${r.parent}`);
    expect(bad, `Parent must be a path ancestor or a hub:\n${bad.join("\n")}`).toEqual([]);
  });

  it("never points Up at a redirect stub", () => {
    const bad = ROUTES
      .filter((r) => r.parent && ROUTE_BY_PATH.get(r.parent)?.kind === "redirect")
      .map((r) => `${r.path} -> ${r.parent}`);
    expect(bad, `Up would bounce through a redirect:\n${bad.join("\n")}`).toEqual([]);
  });

  it("has no cycles", () => {
    for (const r of ROUTES) {
      const seen = new Set<string>();
      let cur: RouteEntry | undefined = r;
      while (cur) {
        if (seen.has(cur.path)) throw new Error(`Cycle through ${cur.path}`);
        seen.add(cur.path);
        cur = cur.parent ? ROUTE_BY_PATH.get(cur.parent) : undefined;
      }
    }
  });

  /**
   * Home is the ONLY root. Module hubs hang off it so that a user whose tabs
   * don't cover a module still resolves an active tab by walking up. `/m` is
   * the bare-entry redirect and has nothing above it.
   */
  it("only Home is a root", () => {
    const roots = ROUTES.filter((r) => r.parent === null).map((r) => r.path).sort();
    expect(roots).toEqual(["/m", "/m/home"]);
  });
});

// ── G5 ────────────────────────────────────────────────────────────────────
describe("G5 — duplicate destinations are declared, not accidental", () => {
  it("every shared list component is declared in sharesListWith", () => {
    const undeclared: string[] = [];
    for (const [component, routeSet] of sharedListComponents()) {
      if (routeSet.size < 2) continue;
      for (const r of routeSet) {
        const entry = ROUTE_BY_PATH.get(r);
        if (!entry) continue;
        const declared = new Set(entry.sharesListWith ?? []);
        for (const other of routeSet) {
          if (other !== r && !declared.has(other)) {
            undeclared.push(`${r} shares ${component} with ${other} — add to sharesListWith`);
          }
        }
      }
    }
    expect(undeclared, undeclared.join("\n")).toEqual([]);
  });

  it("sharesListWith is symmetric and points at real routes", () => {
    const bad: string[] = [];
    for (const r of ROUTES) {
      for (const other of r.sharesListWith ?? []) {
        const o = ROUTE_BY_PATH.get(other);
        if (!o) { bad.push(`${r.path} -> ${other} (not a route)`); continue; }
        if (!(o.sharesListWith ?? []).includes(r.path)) {
          bad.push(`${r.path} -> ${other} is not reciprocated`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   G6-G8 — CAPABILITY GUARDS

   Access is granted per user (UserPermission rows), so the real space of
   permission sets is 2^n, not the 7 personas. These guards are therefore
   property-based: they hold for randomly generated permission sets.
   ═══════════════════════════════════════════════════════════════════════════ */

/** 60 random permission sets + the 7 persona sets + the two extremes. */
function permissionSamples(): { label: string; ctx: NavContext }[] {
  const out = PERSONAS.map((p) => ({ label: `persona:${p}`, ctx: ctxFor(p) }));
  out.push({ label: "superuser", ctx: { persona: "executive", permissions: [...ALL_PERMISSIONS] } });
  out.push({ label: "no-permissions", ctx: { persona: "field", permissions: [] } });
  const rand = rng(20260906);
  for (let i = 0; i < 60; i++) {
    const density = rand();
    const permissions = ALL_PERMISSIONS.filter(() => rand() < density);
    out.push({
      label: `random#${i}(${permissions.length})`,
      ctx: { persona: PERSONAS[Math.floor(rand() * PERSONAS.length)]!, permissions },
    });
  }
  return out;
}

describe("G6 — navigation never shows a dead end", () => {
  it("every perm on a route is a real permission key", () => {
    const valid = new Set(ALL_PERMISSIONS);
    const bad = ROUTES.filter((r) => r.perm && !valid.has(r.perm))
      .map((r) => `${r.path}: "${r.perm}" is not in ALL_PERMISSIONS`);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every surfaced route passes its own access gate", () => {
    for (const { label, ctx } of permissionSamples()) {
      for (const section of menuFor(ctx)) {
        for (const r of section.routes) {
          expect(canAccess(r, ctx.permissions), `${label}: menu shows ${r.path}`).toBe(true);
        }
      }
      for (const t of tabsFor(ctx)) {
        expect(canAccess(t, ctx.permissions), `${label}: tab ${t.path}`).toBe(true);
      }
      for (const s of searchableFor(ctx)) {
        const entry = ROUTE_BY_PATH.get(s.path)!;
        expect(canAccess(entry, ctx.permissions), `${label}: search offers ${s.path}`).toBe(true);
      }
    }
  });

  /**
   * A route with no `perm` anywhere up its parent chain is open to everyone.
   * That is correct for a handful of routes and a silent leak for any other —
   * `canAccess` returns true by definition, so no amount of self-consistency
   * checking catches it. When the seed left the Inventory, HR, Site, Pulse and
   * Expenses hubs universal (their page files reference no PERM directly), a
   * zero-permission user got Inventory and HR tabs and a 17-route menu.
   *
   * So the universal set is an allowlist, not an accident.
   */
  it("only genuinely universal routes are ungated", () => {
    const UNIVERSAL = ["/m/home", "/m/me", "/m/queue", "/m/settings"];
    // Redirect stubs need no gate of their own — whatever they redirect to
    // enforces one, and G4 already guarantees they are never an Up target.
    const ungated = ROUTES
      .filter((r) => r.kind !== "redirect" && !permFor(r))
      .map((r) => r.path)
      .sort();
    expect(
      ungated,
      "A route with no perm is open to EVERY user, including one with zero " +
      "permissions. Either give it a `perm` or add it to this allowlist " +
      "deliberately.",
    ).toEqual(UNIVERSAL.sort());
  });

  it("a user with no permissions gets a usable but empty-handed shell", () => {
    const ctx: NavContext = { persona: "field", permissions: [] };
    // Still four tabs (Home + universal backfill) so the shell never breaks…
    expect(tabsFor(ctx)).toHaveLength(4);
    // …but nothing they aren't entitled to.
    const paths = menuFor(ctx).flatMap((s) => s.routes).map((r) => r.path);
    expect(paths).not.toContain("/m/inventory");
    expect(paths).not.toContain("/m/hr");
    expect(paths).not.toContain("/m/accounts");
  });
});

describe("G7 — no granted capability is invisible", () => {
  /**
   * The bug this locks out: /api/me used to return only `role`, so the client
   * evaluated access against the role matrix alone. A permission granted to
   * ONE user (UserPermission) was enforced by the API but had no entry point
   * anywhere in the UI. Granting it was silently a no-op.
   */
  it("holding a route's permission makes that route appear in the menu", () => {
    const gated = [...new Set(ROUTES
      .filter((r) => !NONMENU.has(r.kind) && !r.hidden)
      .map((r) => permFor(r))
      .filter((p): p is string => !!p))];
    const invisible: string[] = [];
    for (const perm of gated) {
      const ctx: NavContext = { persona: "field", permissions: [perm] };
      const shown = menuFor(ctx).flatMap((s) => s.routes).filter((r) => permFor(r) === perm);
      if (shown.length === 0) invisible.push(perm);
    }
    expect(invisible, `Granting these permissions surfaces nothing:\n${invisible.join("\n")}`)
      .toEqual([]);
  });

  it("an extra grant strictly widens the menu, never narrows it", () => {
    const base = ctxFor("field");
    const widened = ctxFor("field", ["finance.view"]);
    const basePaths = new Set(menuFor(base).flatMap((s) => s.routes).map((r) => r.path));
    const widePaths = new Set(menuFor(widened).flatMap((s) => s.routes).map((r) => r.path));
    for (const p of basePaths) expect(widePaths.has(p), `lost ${p}`).toBe(true);
    expect(widePaths.size).toBeGreaterThan(basePaths.size);
  });

  it("keeps the tab bar stable when an unrelated permission is granted", () => {
    // Prominence must not lurch around because someone got one extra grant.
    const before = tabsFor(ctxFor("procurement")).map((r) => r.path);
    const after = tabsFor(ctxFor("procurement", ["finance.view"])).map((r) => r.path);
    expect(after).toEqual(before);
  });
});

describe("G8 — the tab bar is always exactly four valid destinations", () => {
  it("holds for every sampled permission set", () => {
    for (const { label, ctx } of permissionSamples()) {
      const tabs = tabsFor(ctx);
      expect(tabs, `${label}: got ${tabs.length} tabs`).toHaveLength(4);
      expect(new Set(tabs.map((t) => t.path)).size, `${label}: duplicate tabs`).toBe(4);
      for (const t of tabs) expect(t.kind).not.toBe("redirect");
    }
  });

  it("resolves at most one active tab, for any permission set and any route", () => {
    for (const { label, ctx } of permissionSamples().slice(0, 12)) {
      const tabPaths = new Set(tabsFor(ctx).map((t) => t.path));
      for (const r of ROUTES) {
        const active = activeTabFor(r.path, ctx);
        if (active) expect(tabPaths.has(active), `${label} @ ${r.path} -> ${active}`).toBe(true);
      }
    }
  });
});

const NONMENU = new Set(["detail", "create", "edit", "redirect"]);

// ── Derivation behaviour ──────────────────────────────────────────────────
describe("derivation helpers", () => {
  const exec = ctxFor("executive");

  it("matches dynamic routes to the most specific entry", () => {
    expect(matchRoute("/m/procurement/clx0000000000000000000")?.path)
      .toBe("/m/procurement/[id]");
    expect(matchRoute("/m/procurement/new")?.path).toBe("/m/procurement/new");
    expect(matchRoute("/m/materials/abc/edit")?.path).toBe("/m/materials/[id]/edit");
  });

  it("strips query strings and trailing slashes", () => {
    expect(matchRoute("/m/stock?tab=transfers")?.path).toBe("/m/stock");
    expect(matchRoute("/m/stock/")?.path).toBe("/m/stock");
  });

  it("resolves Up with the live id, not the [id] placeholder", () => {
    expect(upHref("/m/materials/abc123/edit")).toBe("/m/materials/abc123");
    expect(upHref("/m/procurement/abc123")).toBe("/m/procurement");
  });

  it("returns null Up for tab roots", () => {
    expect(upHref("/m/home")).toBeNull();
  });

  it("prefers the entity label over the manifest title (D3 regression)", () => {
    // The old shell derived the title from the URL, so a person's page
    // rendered "Employees". The entity label must win.
    expect(titleFor("/m/hr/employees/abc123")).toBe("Employee");
    expect(titleFor("/m/hr/employees/abc123", "Ramesh Kumar")).toBe("Ramesh Kumar");
  });

  it("builds a breadcrumb chain from the root", () => {
    expect(breadcrumbs("/m/materials/abc123/edit").map((r) => r.path)).toEqual([
      "/m/home", "/m/inventory", "/m/materials", "/m/materials/[id]", "/m/materials/[id]/edit",
    ]);
  });

  it("inherits the access gate from the parent chain", () => {
    // /m/materials declares inventory.view; its children don't restate it.
    expect(permFor(ROUTE_BY_PATH.get("/m/materials/[id]")!)).toBeTruthy();
    // Home is universal, and so is everything that only inherits from it.
    expect(permFor(ROUTE_BY_PATH.get("/m/home")!)).toBeUndefined();
  });

  it("only exposes badges for the user's own tabs (D9 regression)", () => {
    for (const persona of PERSONAS) {
      const ctx = ctxFor(persona);
      const tabPaths = tabsFor(ctx).map((t) => t.path);
      for (const b of badgeEndpointsFor(ctx)) expect(tabPaths).toContain(b.path);
    }
  });

  it("never lists detail/create/redirect routes in the menu", () => {
    for (const section of menuFor(exec)) {
      for (const r of section.routes) {
        expect(["hub", "list", "report", "tool"]).toContain(r.kind);
      }
    }
  });

  it("orders prominent sections first", () => {
    const sections = menuFor(ctxFor("finance"));
    const firstNonProminent = sections.findIndex((s) => !s.prominent);
    if (firstNonProminent !== -1) {
      expect(sections.slice(firstNonProminent).every((s) => !s.prominent)).toBe(true);
    }
  });

  it("indexes every non-redirect static route for search", () => {
    const indexed = new Set(SEARCH_INDEX.map((r) => r.path));
    const expected = ROUTES.filter((r) => r.kind !== "redirect" && !r.path.includes("["));
    for (const r of expected) expect(indexed.has(r.path), r.path).toBe(true);
  });

  it("suggests flow neighbours as related", () => {
    const related = relatedTo("/m/procurement/abc123").map((r) => r.path);
    expect(related.length).toBeGreaterThan(0);
    expect(related).not.toContain("/m/procurement/[id]");
  });
});
