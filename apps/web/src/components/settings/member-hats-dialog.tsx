"use client";

import { useState } from "react";
import { Loader2, HardHat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export interface HatOption {
  key: string;
  label: string;
}

/**
 * MemberHatsDialog — manage a member's secondary roles ("hats").
 *
 * A member's held set is { primary role } ∪ secondaryRoles on their
 * company membership. They can switch hats from the app header — only the
 * worn hat's permissions apply (no union). This dialog edits the secondary
 * list only; the primary role is changed from the members table itself.
 *
 * Calls PATCH /api/users/[id] with { secondaryRoles } — the API enforces
 * the tier both ways (actor must be above every role held AND every role
 * assigned), resolves CUSTOM_* tiers from the DB, resets activeRole if the
 * worn hat left the set, and writes an audit entry.
 */
export function MemberHatsDialog({
  userId,
  userName,
  primaryRoleLabel,
  currentSecondary,
  options,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  /** Display label of the member's primary role (shown read-only). */
  primaryRoleLabel: string;
  /** Role keys currently held as secondary hats. */
  currentSecondary: string[];
  /** Assignable hats — built-ins the actor may grant + custom roles. */
  options: HatOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentSecondary));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secondaryRoles: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update hats");
      toast.success("Hats updated", {
        description: `${userName} can switch between their hats from the app header — only the worn hat's permissions apply.`,
      });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update hats");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Hats for ${userName}`}
      description="Secondary roles this member can switch into from the app header. Only the worn hat's permissions apply — hats don't combine."
      className="max-w-md"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <span>Primary role:</span>
          <Badge variant="muted">{primaryRoleLabel}</Badge>
          <span className="text-[10px]">(change from the members table)</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border divide-y divide-border">
          {options.length === 0 && (
            <p className="p-3 text-caption text-muted-foreground">
              No roles below your tier to grant.
            </p>
          )}
          {options.map((o) => {
            const held = selected.has(o.key);
            return (
              <label
                key={o.key}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-body hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={held}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(o.key)) next.delete(o.key);
                      else next.add(o.key);
                      return next;
                    })
                  }
                  className="size-4 accent-primary"
                />
                <span className="font-medium">{o.label}</span>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <HardHat className="size-4" />}
            Save hats
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
