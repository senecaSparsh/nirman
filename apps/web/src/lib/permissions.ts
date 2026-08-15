"use client";

import { useEffect, useState } from "react";
import { hasPermission, isManagerOrAbove, normalizeRole, type Role } from "@/lib/roles";

/**
 * Client-side permission hook. Fetches the current user's role from
 * `/api/me` (once per mount) and exposes `can(perm)` plus convenience
 * flags. Use this to gate create/edit/delete/approve buttons in client
 * components. The server is the source of truth — this hook is purely
 * for UI affordance; every API route enforces permissions server-side.
 */
export function usePermissions() {
  const [role, setRole] = useState<Role>("MANAGER");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.role) setRole(normalizeRole(d.role));
        if (d?.id) setUserId(d.id);
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
    loading,
    can: (perm: string) => hasPermission(role, perm),
    isManagerOrAbove: () => isManagerOrAbove(role),
    isOwnerOrAdmin: () => role === "OWNER" || role === "ADMIN",
    canManageUsers: () => role === "OWNER" || role === "ADMIN",
    canAssignTasks: () => isManagerOrAbove(role),
    canManageWorkflows: () => isManagerOrAbove(role),
    canApproveProcurement: () =>
      hasPermission(role, "po.approve") || hasPermission(role, "requisition.approve"),
  };
}
