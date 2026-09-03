"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Shield, HardHat, Package, ShoppingCart, MapPin, Calculator,
  TrendingUp, Users, FileText, Truck, DoorOpen, CheckSquare, Phone, Settings,
  Check, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { PERMISSION_MODULES, PERM } from "@/lib/roles";

const ICONS: Record<string, typeof Shield> = {
  HardHat, Package, ShoppingCart, MapPin, Calculator, TrendingUp, Users,
  FileText, Truck, DoorOpen, CheckSquare, Phone, Settings,
};

type PermissionsResponse = {
  membershipId: string;
  role: string;
  baseRolePermissions: string[];
  roleOverrides: string[];
  userOverrides: string[];
  effective: string[];
};

/**
 * PermissionsEditorDialog — lets a manager grant additional module-level
 * permissions to a specific user (per-company-membership). Shows which
 * permissions the user already has from their role, and lets the manager
 * toggle per-user additive overrides.
 *
 * Calls GET /api/users/[id]/permissions to load current state, then
 * PATCH /api/users/[id]/permissions to save.
 */
export function PermissionsEditorDialog({
  userId,
  userName,
  userRole,
  canEdit,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  userRole: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PermissionsResponse | null>(null);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}/permissions`);
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Failed to load permissions");
        }
        const d: PermissionsResponse = await res.json();
        if (cancelled) return;
        setData(d);
        setOverrides(new Set(d.userOverrides));
      } catch (err: unknown) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load permissions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Check if a permission is granted by the role (base + role overrides)
  function isFromRole(perm: string): boolean {
    if (!data) return false;
    return data.baseRolePermissions.includes(perm) || data.roleOverrides.includes(perm);
  }

  function isOverridden(perm: string): boolean {
    return overrides.has(perm);
  }

  function isEffective(perm: string): boolean {
    return isFromRole(perm) || isOverridden(perm);
  }

  function toggleOverride(perm: string) {
    if (!canEdit) return;
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  function toggleModule(moduleKey: string, perms: string[]) {
    if (!canEdit) return;
    // If all perms in this module are overridden, remove all. Otherwise, add all
    // that aren't already from the role.
    const allOverridden = perms.every((p) => overrides.has(p) || isFromRole(p));
    setOverrides((prev) => {
      const next = new Set(prev);
      if (allOverridden) {
        // Remove all overrides in this module
        perms.forEach((p) => next.delete(p));
      } else {
        // Add all perms in this module that aren't from the role
        perms.forEach((p) => {
          if (!isFromRole(p)) next.add(p);
        });
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(overrides) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to update permissions");
      toast.success("Permissions updated", {
        description: `${userName}: ${overrides.size} per-user override${overrides.size !== 1 ? "s" : ""} saved.`,
      });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = data && (
    overrides.size !== data.userOverrides.length ||
    !Array.from(overrides).every((p) => data.userOverrides.includes(p))
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Module Permissions — ${userName}`}
      description={`Role: ${userRole}. Toggle modules to grant additional access beyond the role defaults.`}
      className="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Summary bar */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 text-caption text-muted-foreground">
              <span className="font-medium text-foreground">{data.effective.length}</span> effective permissions
              {" · "}
              <span className="font-medium text-foreground">{data.baseRolePermissions.length + data.roleOverrides.length}</span> from role
              {" · "}
              <span className="font-medium text-foreground">{overrides.size}</span> per-user overrides
            </div>
            {hasChanges && (
              <Badge variant="warning" className="text-[10px]">Unsaved</Badge>
            )}
          </div>

          {/* Module groups */}
          {PERMISSION_MODULES.map((mod) => {
            const Icon = ICONS[mod.icon] ?? Shield;
            const modulePerms = mod.permissions;
            const effectiveCount = modulePerms.filter((p) => isEffective(p)).length;
            const overrideCount = modulePerms.filter((p) => isOverridden(p)).length;
            const totalCount = modulePerms.length;
            const allEffective = effectiveCount === totalCount;
            const expanded = expandedModule === mod.key;

            return (
              <div key={mod.key} className="rounded-md border border-border overflow-hidden">
                {/* Module header */}
                <button
                  type="button"
                  onClick={() => setExpandedModule(expanded ? null : mod.key)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                >
                  <div className={`grid place-items-center size-7 rounded-md shrink-0 ${allEffective ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`h-3.5 w-3.5 ${allEffective ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium text-foreground">{mod.label}</span>
                      {overrideCount > 0 && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          +{overrideCount} override{overrideCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <span className="text-caption text-muted-foreground">
                      {effectiveCount}/{totalCount} permissions
                    </span>
                  </div>
                  {canEdit && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); toggleModule(mod.key, modulePerms); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleModule(mod.key, modulePerms); } }}
                      className={`shrink-0 rounded-md px-2 py-1 text-caption font-medium transition-colors ${
                        allEffective
                          ? "text-muted-foreground hover:text-foreground"
                          : "text-primary hover:bg-primary/10"
                      }`}
                    >
                      {allEffective ? "Remove all" : "Grant all"}
                    </span>
                  )}
                </button>

                {/* Expanded permission list */}
                {expanded && (
                  <div className="border-t border-border bg-card">
                    {modulePerms.map((perm) => {
                      const fromRole = isFromRole(perm);
                      const overridden = isOverridden(perm);
                      const effective = fromRole || overridden;
                      // Pretty label from PERM key
                      const permKey = Object.keys(PERM).find((k) => PERM[k as keyof typeof PERM] === perm);
                      const label = permKey
                        ? permKey.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                        : perm;

                      return (
                        <div
                          key={perm}
                          className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0"
                        >
                          <button
                            type="button"
                            disabled={!canEdit || fromRole}
                            onClick={() => toggleOverride(perm)}
                            className={`grid place-items-center size-5 rounded border shrink-0 transition-colors ${
                              effective
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input bg-card hover:border-border-strong"
                            } ${(!canEdit || fromRole) ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                          >
                            {effective && <Check className="size-3" />}
                          </button>
                          <span className="flex-1 text-caption text-foreground">{label}</span>
                          <code className="text-[10px] font-mono text-muted-foreground">{perm}</code>
                          {fromRole && (
                            <Badge variant="muted" className="text-[10px] py-0 px-1.5">Role</Badge>
                          )}
                          {overridden && (
                            <Badge variant="success" className="text-[10px] py-0 px-1.5">Override</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Action bar */}
          <div className="flex items-center justify-between gap-2 pt-2 sticky bottom-0 bg-background">
            <p className="text-caption text-muted-foreground">
              {canEdit
                ? "Overrides are additive — they grant access beyond the role. They cannot revoke role-level access."
                : "Read-only view. You need user management permission to change this."}
            </p>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>
              {canEdit && (
                <Button type="button" size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-body text-danger">Failed to load permissions</div>
      )}
    </Dialog>
  );
}
