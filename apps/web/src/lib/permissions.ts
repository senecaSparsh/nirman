"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr";
import { hasPermission, isManagerOrAbove, normalizeRole, type Role } from "@/lib/roles";

interface MeResponse {
  id?: string | null;
  role?: string | null;
  actingRole?: string | null;
  actingFor?: { name: string; endsAt: string }[];
  permissions?: unknown;
  /** Multi-role: all hats held + the hat currently worn + labels. */
  roles?: string[];
  activeRole?: string | null;
  roleLabels?: Record<string, string>;
}

/**
 * Client-side permission hook. Reads the current user's role AND effective
 * permissions from `/api/me` via SWR and exposes `can(perm)` plus
 * convenience flags. Use this to gate create/edit/delete/approve buttons in
 * client components. The server is the source of truth — this hook is purely
 * for UI affordance; every API route enforces permissions server-side.
 *
 * SWR gives this three advantages over the old per-mount useEffect fetch:
 *   1. Deduped — every usePermissions() on a page shares one /api/me request.
 *   2. Cached — remounts render instantly with cached data and revalidate
 *      in the background.
 *   3. Pre-seeded — the root layout injects the server-resolved identity as
 *      SWR fallback for "/api/me", so the role is correct on first paint
 *      instead of popping in after a client round-trip.
 *
 * `permissions` is the merged set the server authorises against (role matrix
 * + RolePermission overrides + per-user UserPermission grants). Passing it to
 * `hasPermission` as the `overrides` argument means a permission granted to
 * one individual is reflected in the UI — buttons appear, nav entries show —
 * exactly matching what the API will allow. Without this, the hook evaluated
 * only the role matrix, so bespoke grants were enforced server-side but
 * invisible client-side.
 */
export function usePermissions() {
  const { data, isLoading } = useSWR<MeResponse | null>("/api/me", swrFetcher);

  // Default to the LEAST-privileged role while loading so privileged
  // buttons don't flash before /api/me resolves. The server is the
  // source of truth — this only affects UI affordance, not access.
  //
  // Multi-role: gate on the WORN hat (activeRole), not the primary role —
  // an OWNER wearing a SUPERVISOR hat must not wildcard through
  // hasPermission. `permissions` is already the worn hat's effective set,
  // so custom-role hats resolve correctly through the overrides path even
  // though normalizeRole() collapses CUSTOM_* to its least-privileged
  // fallback here.
  const role: Role = data?.activeRole
    ? normalizeRole(data.activeRole)
    : data?.role
      ? normalizeRole(data.role)
      : "SUPERVISOR";
  // The role the user is currently acting as — equals `role` unless a live
  // delegation grants higher authority. Affordance gates consult this so a
  // delegate sees the surface they can actually act on.
  const actingRole: Role = data?.actingRole ? normalizeRole(data.actingRole) : role;
  const actingFor = data?.actingFor ?? [];
  const userId: string | null = data?.id ?? null;
  const permissions: string[] = Array.isArray(data?.permissions)
    ? (data.permissions as string[])
    : [];
  // Multi-role: held hats + the worn hat (raw keys — CUSTOM_* included)
  // + labels, for the role switcher and hat badges.
  const roles: string[] = Array.isArray(data?.roles) ? data.roles : [];
  const activeRole: string | null = data?.activeRole ?? null;
  const roleLabels: Record<string, string> = data?.roleLabels ?? {};
  const loading = isLoading;

  return {
    role,
    actingRole,
    roles,
    activeRole,
    roleLabels,
    actingFor,
    userId,
    permissions,
    loading,
    can: (perm: string) => hasPermission(role, perm, permissions),
    isManagerOrAbove: () => isManagerOrAbove(actingRole),
    isOwnerOrAdmin: () => actingRole === "OWNER" || actingRole === "ADMIN" || actingRole === "DEVELOPER",
    canManageUsers: () => actingRole === "OWNER" || actingRole === "ADMIN" || actingRole === "DEVELOPER",
    canAssignTasks: () => isManagerOrAbove(actingRole),
    canManageWorkflows: () => isManagerOrAbove(actingRole),
    canApproveProcurement: () =>
      hasPermission(role, "po.approve", permissions) ||
      hasPermission(role, "requisition.approve", permissions),
  };
}
