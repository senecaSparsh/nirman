import {
  Boxes,
  Users,
  BookOpen,
  Home,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * MOBILE PERSONA + MODULE METADATA
 *
 * The route manifest (`route-manifest.ts`) is now the single source of truth
 * for navigation: tabs, menu tree, search index, Up targets, active tab
 * resolution, and permission gating all derive from it. This file retains
 * only the two things the manifest does not own:
 *
 *   1. `Persona` — the 7-way role→persona mapping used for ranking (tab
 *      slots, section order, what starts expanded). Persona never gates
 *      access; `canAccess` in the manifest does.
 *   2. `ALL_NAV_MODULES` — 5 rows of module metadata (id/label/icon) used
 *      by the NavSheet accordion headers.
 *
 * Everything else that used to live here — NAV_GROUPS, PATH_TO_MODULE,
 * WORKFLOW_LINKS, PERSONA_TABS, MOBILE_TABS, ALL_NAV_LINKS, tabsForRole,
 * moduleFromPath, goBackFallback, isModuleActive, activeModuleTab,
 * navGroupsForPersona, allNavGroupsForPersona, workflowLinksForPath —
 * was dead code after the manifest migration. The manifest's
 * `menuGroupsForPersona`, `tabsFor`, `activeTabFor`, `upHref`,
 * `relatedTo`, and `SEARCH_INDEX` replaced them.
 */

// ── Persona ─────────────────────────────────────────────────────────

/**
 * Maps a role to a persona. Personas group roles that share the same
 * mobile tab bar. The mapping follows the 5-tier delegation hierarchy:
 *
 *   Executive  — OWNER, ADMIN, PROJECT_DIRECTOR
 *   Ops        — PROJECT_MANAGER
 *   Procurement— PROCUREMENT_MANAGER, STORE_KEEPER
 *   Field      — SITE_ENGINEER, SUPERVISOR, QAQC_ENGINEER
 *   Sales      — SALES_MANAGER
 *   Finance    — ACCOUNTANT, FINANCE_HEAD
 *   HR         — HR_MANAGER
 */
export type Persona =
  | "executive"
  | "ops"
  | "procurement"
  | "field"
  | "sales"
  | "finance"
  | "hr";

export function roleToPersona(role: string): Persona {
  switch (role) {
    case "OWNER":
    case "ADMIN":
    case "PROJECT_DIRECTOR":
      return "executive";
    case "PROJECT_MANAGER":
      return "ops";
    case "PROCUREMENT_MANAGER":
    case "STORE_KEEPER":
      return "procurement";
    case "SITE_ENGINEER":
    case "SUPERVISOR":
    case "QAQC_ENGINEER":
      return "field";
    case "SALES_MANAGER":
      return "sales";
    case "ACCOUNTANT":
    case "FINANCE_HEAD":
      return "finance";
    case "HR_MANAGER":
      return "hr";
    default:
      return "executive";
  }
}

// ── Module metadata ─────────────────────────────────────────────────

/**
 * Metadata for all navigation modules — used by the NavSheet to render
 * the accordion section headers. Each module has an id (matching the
 * `module` field on RouteEntry), a display label, and an icon.
 */
export interface NavModule {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const ALL_NAV_MODULES: NavModule[] = [
  { id: "home", label: "Home & Dashboards", icon: Home },
  { id: "inventory", label: "Inventory & Procurement", icon: Boxes },
  { id: "hr", label: "HR & Field", icon: Users },
  { id: "accounts", label: "Accounts & Finance", icon: BookOpen },
  { id: "settings", label: "Settings & Admin", icon: Settings },
];
