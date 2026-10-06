"use client";

/**
 * Client-side create-permission gate for mobile pickers/dialogs.
 *
 * The shell already fetches `/api/me` (global `permissions`, `scopeType`,
 * `scopedPermissions`); this context exposes them so any form can answer
 * "should I show the + Create button?" WITHOUT a prop-thread through every
 * page.
 *
 * IMPORTANT: this is a DISPLAY gate, not an authorization check — the API
 * routes still enforce their own perms. The map mirrors each create POST's
 * gate so a button only shows when the POST would actually succeed:
 *   - master-data creates (supplier/material/customer) — POSTs accept
 *     effective perms (scoped hats can onboard vendors/materials), so the
 *     display check uses the union too.
 *   - topology creates (project/location/company/department) — POSTs stay
 *     on global requirePermission, so the button needs the GLOBAL perm
 *     + COMPANY scope.
 *   - employee/worker — GLOBAL hr.manage (PII + H1 wall on the POST).
 *
 * Callers with no mapping default to SHOWING the affordance — current
 * behavior — so a wrong guess never silently removes a real button.
 */
import { createContext, useContext, type ReactNode } from "react";

export type CreateEntity =
  | "project"
  | "material"
  | "supplier"
  | "customer"
  | "location"
  | "employee"
  | "company"
  | "department"
  | "unit"
  | "vehicle"
  | "worker"
  | "subcontractor"
  | "category"
  | "parcel"
  | "broker";

const ENTITY_PERM: Record<CreateEntity, { perm: string; companyScope?: boolean }> = {
  project: { perm: "projects.manage", companyScope: true },
  material: { perm: "inventory.manage" },
  supplier: { perm: "procurement.manage" },
  customer: { perm: "sales.manage" },
  location: { perm: "inventory.manage", companyScope: true },
  employee: { perm: "hr.manage" },
  company: { perm: "company.manage", companyScope: true },
  department: { perm: "company.manage" },
  unit: { perm: "inventory.manage" },
  vehicle: { perm: "inventory.manage" },
  worker: { perm: "hr.manage" },
  subcontractor: { perm: "procurement.manage" },
  category: { perm: "inventory.manage" },
  parcel: { perm: "projects.manage" },
  broker: { perm: "sales.manage" },
};

type MobilePerms = {
  /** GLOBAL perms (membership + overrides) — `/api/me` `permissions`. */
  globalPermissions: string[];
  /** Scoped-hat perms — `/api/me` `scopedPermissions`. */
  scopedPermissions: string[];
  scopeType: "COMPANY" | "DEPARTMENT" | "PROJECT" | "NONE";
};

const MobilePermsContext = createContext<MobilePerms | null>(null);

export function MobilePermsProvider({
  globalPermissions,
  scopedPermissions,
  scopeType,
  children,
}: MobilePerms & { children: ReactNode }) {
  return (
    <MobilePermsContext.Provider value={{ globalPermissions, scopedPermissions, scopeType }}>
      {children}
    </MobilePermsContext.Provider>
  );
}

/** True when the user could actually complete the create POST for `entity`.
 *  Pass `undefined` to mean "no gate" — returns true. Safe to call
 *  unconditionally (the hook itself is always invoked). */
export function useCanCreate(entity?: CreateEntity): boolean {
  const ctx = useContext(MobilePermsContext);
  if (!ctx || !entity) return true; // outside the shell / ungated — don't suppress
  const rule = ENTITY_PERM[entity];
  if (!rule) return true;
  if (rule.companyScope) {
    // Topology — global perm + company scope only.
    const globalOk = ctx.globalPermissions.includes(rule.perm) || ctx.globalPermissions.includes("*");
    return globalOk && ctx.scopeType === "COMPANY";
  }
  // Master data — scoped hats count (POSTs accept effective perms).
  const effective = ctx.globalPermissions.includes(rule.perm) || ctx.scopedPermissions.includes(rule.perm);
  return effective || ctx.globalPermissions.includes("*");
}

/** Generic permission check for non-create affordances (record payment,
 *  mark paid, approve…). `perm` — an effective-perm check (global or
 *  scoped hat counts); pass `global: true` when the server only accepts
 *  the global perm. Outside the shell / no perm given → returns true so
 *  a wrong guess never removes a real control. */
export function usePerm(perm?: string, opts?: { global?: boolean }): boolean {
  const ctx = useContext(MobilePermsContext);
  if (!ctx || !perm) return true;
  const perms = opts?.global ? ctx.globalPermissions : [...ctx.globalPermissions, ...ctx.scopedPermissions];
  return perms.includes(perm) || ctx.globalPermissions.includes("*");
}
