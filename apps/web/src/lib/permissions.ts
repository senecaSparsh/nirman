"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr";
import { hasPermission, isManagerOrAbove, normalizeRole, type Role } from "@/lib/roles";

interface MeResponse {
  id?: string | null;
  role?: string | null;
  permissions?: unknown;
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
  const role: Role = data?.role ? normalizeRole(data.role) : "SUPERVISOR";
  const userId: string | null = data?.id ?? null;
  const permissions: string[] = Array.isArray(data?.permissions)
    ? (data.permissions as string[])
    : [];
  const loading = isLoading;

  return {
    role,
    userId,
    permissions,
    loading,
    can: (perm: string) => hasPermission(role, perm, permissions),
    isManagerOrAbove: () => isManagerOrAbove(role),
    isOwnerOrAdmin: () => role === "OWNER" || role === "ADMIN" || role === "DEVELOPER",
    canManageUsers: () => role === "OWNER" || role === "ADMIN" || role === "DEVELOPER",
    canAssignTasks: () => isManagerOrAbove(role),
    canManageWorkflows: () => isManagerOrAbove(role),
    canApproveProcurement: () =>
      hasPermission(role, "po.approve", permissions) ||
      hasPermission(role, "requisition.approve", permissions),
  };
}
