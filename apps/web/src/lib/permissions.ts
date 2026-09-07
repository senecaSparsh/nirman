"use client";

import { useEffect, useState } from "react";
import { hasPermission, isManagerOrAbove, normalizeRole, type Role } from "@/lib/roles";

/**
 * Client-side permission hook. Fetches the current user's role AND effective
 * permissions from `/api/me` (once per mount) and exposes `can(perm)` plus
 * convenience flags. Use this to gate create/edit/delete/approve buttons in
 * client components. The server is the source of truth — this hook is purely
 * for UI affordance; every API route enforces permissions server-side.
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
  // Default to the LEAST-privileged role while loading so privileged
  // buttons don't flash before /api/me resolves. The server is the
  // source of truth — this only affects UI affordance, not access.
  const [role, setRole] = useState<Role>("SUPERVISOR");
  const [userId, setUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.role) setRole(normalizeRole(d.role));
        if (d?.id) setUserId(d.id);
        if (Array.isArray(d?.permissions)) setPermissions(d.permissions as string[]);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
