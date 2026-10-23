"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { useFetch } from "@/lib/use-fetch";
import { PERMISSION_MODULES } from "@/lib/roles";
import { permissionLabel } from "@/lib/utils";
import type { AccessExplanation, AccessSource } from "@/lib/access-explain";

type Holder = AccessExplanation & {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  label: string;
};

const VIA_LABEL: Record<AccessSource["kind"], string> = {
  ROLE: "Role",
  GRANT: "Individual grant",
  DELEGATION: "Delegated",
  PROJECT_HAT: "Project role",
};

function scopeOf(holder: Holder): string {
  if (holder.global) return "Company-wide";
  return holder.via.flatMap((v) => (v.kind === "PROJECT_HAT" ? [v.projectName] : [])).join(", ");
}

export function WhoCanDialog({ onClose }: { onClose: () => void }) {
  const [permission, setPermission] = useState("");
  const { data, loading, error } = useFetch<{ holders: Holder[] }>(
    `/api/access/who-can?permission=${encodeURIComponent(permission)}`,
    { skip: !permission },
  );
  const holders = data?.holders ?? [];

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Who can do this?"
      description="Everyone in this company who holds a permission, and how they got it."
      className="max-w-2xl"
    >
      <Select aria-label="Choose a permission" value={permission} onChange={(e) => setPermission(e.target.value)} className="max-w-sm">
        <option value="">Choose a permission</option>
        {PERMISSION_MODULES.map((mod) => (
          <optgroup key={mod.key} label={mod.label}>
            {mod.permissions.map((p) => (
              <option key={p} value={p}>{permissionLabel(p)}</option>
            ))}
          </optgroup>
        ))}
      </Select>

      <div className="mt-4">
        {!permission ? (
          <p className="text-caption text-muted-foreground">Choose a permission to see who holds it.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-caption text-destructive">Could not load who holds this permission.</p>
        ) : holders.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="Nobody holds this permission"
            description="No one in this company has it through a role, a grant, a delegation or a project role."
            size="compact"
          />
        ) : (
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
            {holders.map((h) => (
              <li key={h.userId} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-foreground">{h.name ?? h.email ?? "Unnamed member"}</p>
                  <p className="text-caption text-muted-foreground">{h.label}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Badge variant="muted">{scopeOf(h)}</Badge>
                  {Array.from(new Set(h.via.map((v) => VIA_LABEL[v.kind]))).map((label) => (
                    <Badge key={label} variant="outline">{label}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
