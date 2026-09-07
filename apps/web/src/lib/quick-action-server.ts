import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany, getUserPermissions } from "@/lib/server";
import { roleToPersona, type Persona } from "@/lib/mobile-nav-v2";
import { quickActionKeysFor } from "@/lib/quick-action-catalogs";
import {
  ROUTES,
  canAccess,
  permFor,
  type ModuleId,
} from "@/lib/route-manifest";

/** A serializable route action (icon is a lucide component reference —
 *  resolved client-side via the route manifest, so we send the path as key). */
export interface ExtraActionDef {
  /** The route path — used as the stable key. */
  key: string;
  href: string;
  label: string;
}

/** Map module ids from the quick-action namespace to route-manifest module ids. */
const MODULE_MAP: Record<"inventory" | "hr" | "accounts", ModuleId> = {
  inventory: "inventory",
  hr: "hr",
  accounts: "accounts",
};

/** Kinds that should not appear as quick actions (detail/create/edit/redirect). */
const EXCLUDED_KINDS = new Set(["detail", "create", "edit", "redirect"]);

/**
 * Compute all routes in the given module that the current user has permission
 * to access, excluding detail/create/edit/redirect routes and routes already
 * in the curated quick-action catalog. Returns a serializable list.
 */
function accessibleExtraActions(
  module: "inventory" | "hr" | "accounts",
  permissions: string[],
  catalogHrefs: Set<string>,
): ExtraActionDef[] {
  const moduleId = MODULE_MAP[module];
  const result: ExtraActionDef[] = [];
  for (const r of ROUTES) {
    if (r.module !== moduleId) continue;
    if (EXCLUDED_KINDS.has(r.kind)) continue;
    if (r.hidden) continue;
    if (!canAccess(r, permissions)) continue;
    // Skip routes already in the curated catalog (matched by href prefix,
    // since catalog hrefs may have query params like /m/procurement?tab=indents).
    const basePath = r.path;
    if (catalogHrefs.has(basePath)) continue;
    // Skip routes whose permission is inherited and universal (no perm) —
    // these are things like /m/home, /m/settings, /m/me which belong to
    // other modules' tabs, not quick actions.
    if (!permFor(r)) continue;
    result.push({
      key: `route:${r.path}`,
      href: r.path,
      label: r.title,
    });
  }
  return result;
}

/**
 * Server helper for mobile module home pages: resolve the current user's
 * persona, load their saved quick-action layouts, and compute the full set
 * of permission-accessible routes for the module (for the "Add" picker).
 *
 * Returns `{ persona, savedLayouts, extraActions }`.
 * - `savedLayouts` is keyed by the full preference key
 *   (`"quick-actions:<module>:<tab>"`) → ordered string[] of action keys.
 *   Empty when the user has not customized anything yet (the client falls
 *   back to the persona default).
 * - `extraActions` is the list of routes the user can access in this module
 *   that are NOT in the curated quick-action catalog. The "Add" picker
 *   merges these with the catalog so the user can pin any route they have
 *   permission to open.
 *
 * Safe to call in a Server Component — uses the request-scoped
 * `getCurrentUser`/`getCompany`/`getUserPermissions` memoized helpers.
 */
export async function loadQuickActionContext(
  module: "inventory" | "hr" | "accounts",
): Promise<{
  persona: Persona;
  savedLayouts: Record<string, string[]>;
  extraActions: ExtraActionDef[];
}> {
  try {
    const user = await getCurrentUser();
    const persona = user ? roleToPersona(user.role) : "executive";

    if (!user) return { persona, savedLayouts: {}, extraActions: [] };

    // getCompany() can throw if the company cookie is missing. Catch and
    // return empty layouts so the page renders with persona defaults.
    let company;
    try {
      company = await getCompany();
    } catch {
      return { persona, savedLayouts: {}, extraActions: [] };
    }

    // Load saved layouts + user permissions in parallel.
    const keys = quickActionKeysFor(module);
    const [rows, permissions] = await Promise.all([
      prisma.userPreference
        .findMany({
          where: { userId: user.id, companyId: company.id, key: { in: keys } },
          select: { key: true, value: true },
        })
        .catch(() => [] as { key: string; value: unknown }[]),
      getUserPermissions(),
    ]);

    const savedLayouts: Record<string, string[]> = {};
    for (const r of rows) {
      if (Array.isArray(r.value) && r.value.every((v) => typeof v === "string")) {
        savedLayouts[r.key] = r.value as string[];
      }
    }

    // Build the set of catalog hrefs (base paths) to exclude from extra actions.
    // We import the catalog to know which routes are already curated.
    const catalogHrefs = await buildCatalogHrefSet(module);

    const extraActions = accessibleExtraActions(module, permissions, catalogHrefs);

    return { persona, savedLayouts, extraActions };
  } catch {
    // Ultimate fallback — never break the page render.
    return { persona: "executive", savedLayouts: {}, extraActions: [] };
  }
}

/** Build a set of base paths (without query params) from the curated catalog
 *  so we can exclude them from the extra-actions list. */
async function buildCatalogHrefSet(
  module: "inventory" | "hr" | "accounts",
): Promise<Set<string>> {
  const { QUICK_ACTION_CATALOGS } = await import("@/lib/quick-action-catalogs");
  const hrefs = new Set<string>();
  for (const tab of QUICK_ACTION_CATALOGS[module]) {
    for (const action of tab.actions) {
      // Strip query params — /m/procurement?tab=indents → /m/procurement
      const base = action.href.split("?")[0]!;
      hrefs.add(base);
    }
  }
  return hrefs;
}
