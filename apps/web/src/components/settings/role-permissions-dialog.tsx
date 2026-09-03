"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Shield, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { ROLE_LIST, PERMISSION_MODULES, PERM, ALL_PERMISSIONS, type Role } from "@/lib/roles";

type RolePermRow = { id: string; permission: string };

/**
 * RolePermissionsDialog — manage per-role additive permission overrides
 * (the RolePermission table). Lets a manager customize what each role can
 * do without code changes.
 *
 * Calls GET /api/role-permissions?role=XXX to load, then
 * PUT /api/role-permissions to save (replace all for a role).
 */
export function RolePermissionsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<Role>("PROJECT_MANAGER");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [originalOverrides, setOriginalOverrides] = useState<Set<string>>(new Set());
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Load overrides for the selected role
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/role-permissions?role=${selectedRole}`);
        const data = await res.json();
        if (cancelled) return;
        const perms = new Set<string>((data.permissions ?? []).map((r: RolePermRow) => r.permission));
        setOverrides(perms);
        setOriginalOverrides(perms);
      } catch {
        if (!cancelled) toast.error("Failed to load role permissions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRole]);

  const roleDef = ROLE_LIST.find((r) => r.key === selectedRole);
  const basePerms = roleDef?.permissions === "*" ? ALL_PERMISSIONS : (roleDef?.permissions ?? []);

  function isBasePerm(perm: string): boolean {
    return basePerms.includes(perm);
  }

  function isOverridden(perm: string): boolean {
    return overrides.has(perm);
  }

  function isEffective(perm: string): boolean {
    return isBasePerm(perm) || isOverridden(perm);
  }

  function toggleOverride(perm: string) {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole, permissions: Array.from(overrides) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setOriginalOverrides(new Set(overrides));
      toast.success("Role permissions updated", {
        description: `${selectedRole}: ${overrides.size} additive override${overrides.size !== 1 ? "s" : ""} saved.`,
      });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setOverrides(new Set(originalOverrides));
  }

  const hasChanges = overrides.size !== originalOverrides.size ||
    !Array.from(overrides).every((p) => originalOverrides.has(p));

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Role Permissions"
      description="Customize what each role can do. Overrides are additive — they grant permissions beyond the role's defaults."
      className="max-w-2xl"
    >
      {/* Role selector */}
      <div className="flex items-center gap-3 mb-3">
        <Shield className="h-4 w-4 text-primary shrink-0" />
        <Select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as Role)} className="max-w-xs">
          {ROLE_LIST.map((r) => (
            <option key={r.key} value={r.key}>{r.label} — {r.description}</option>
          ))}
        </Select>
        {hasChanges && <Badge variant="warning" className="text-[10px]">Unsaved</Badge>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {roleDef?.permissions === "*" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 mb-2">
              <p className="text-caption text-foreground">
                <span className="font-semibold">{selectedRole}</span> has all permissions by default ({ALL_PERMISSIONS.length}). Overrides are not needed but can still be added for documentation.
              </p>
            </div>
          )}

          {PERMISSION_MODULES.map((mod) => {
            const modulePerms = mod.permissions;
            const effectiveCount = modulePerms.filter((p) => isEffective(p)).length;
            const overrideCount = modulePerms.filter((p) => isOverridden(p)).length;
            const totalCount = modulePerms.length;
            const allEffective = effectiveCount === totalCount;
            const expanded = expandedModule === mod.key;

            return (
              <div key={mod.key} className="rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedModule(expanded ? null : mod.key)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                >
                  <div className={`grid place-items-center size-6 rounded shrink-0 ${allEffective ? "bg-primary/10" : "bg-muted"}`}>
                    <Shield className={`size-3 ${allEffective ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-body font-medium text-foreground">{mod.label}</span>
                    <span className="ml-2 text-caption text-muted-foreground">{effectiveCount}/{totalCount}</span>
                  </div>
                  {overrideCount > 0 && (
                    <Badge variant="success" className="text-[10px] py-0 px-1.5">+{overrideCount}</Badge>
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-border bg-card">
                    {modulePerms.map((perm) => {
                      const base = isBasePerm(perm);
                      const overridden = isOverridden(perm);
                      const effective = base || overridden;
                      const permKey = Object.keys(PERM).find((k) => PERM[k as keyof typeof PERM] === perm);
                      const label = permKey
                        ? permKey.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                        : perm;

                      return (
                        <div key={perm} className="flex items-center gap-3 px-3 py-1.5 border-b border-border last:border-0">
                          <button
                            type="button"
                            disabled={base}
                            onClick={() => toggleOverride(perm)}
                            className={`grid place-items-center size-4 rounded border shrink-0 transition-colors ${
                              effective ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-border-strong"
                            } ${base ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                          >
                            {effective && <span className="text-[8px]">✓</span>}
                          </button>
                          <span className="flex-1 text-caption text-foreground">{label}</span>
                          {base && <Badge variant="muted" className="text-[10px] py-0 px-1.5">Default</Badge>}
                          {overridden && <Badge variant="success" className="text-[10px] py-0 px-1.5">Override</Badge>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 pt-2 sticky bottom-0 bg-background">
            <div className="flex gap-2">
              {hasChanges && (
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw className="size-3.5" /> Revert
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
