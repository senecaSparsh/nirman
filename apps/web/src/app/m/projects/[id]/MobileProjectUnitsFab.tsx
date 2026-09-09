"use client";

import { useState } from "react";
import { Home } from "lucide-react";
import { MobileNewUnitDialog } from "@/app/m/units/MobileNewUnitDialog";
import type { ActionPermissions } from "@/lib/server";

/**
 * MobileProjectUnitsFab — renders the "Add Built Units" quick-action tile
 * on the mobile project detail page. Opens the multi-unit dialog inline
 * (scoped to this project) instead of navigating to /m/units.
 */
export function MobileProjectUnitsFab({
  projectId,
  projectName,
  canManage,
  actions,
}: {
  projectId: string;
  projectName: string;
  canManage: boolean;
  actions?: ActionPermissions;
}) {
  const [open, setOpen] = useState(false);

  // TODO: pass actions from page
  if (!(actions?.canCreateBuiltUnit ?? canManage)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch flex flex-col items-center justify-center gap-1 rounded-[0.5rem] py-2 px-1 text-m-caption font-semibold text-center press"
        style={{
          backgroundColor: "var(--color-paper)",
          border: "1px solid var(--color-line)",
          color: "var(--color-ink-700)",
          minHeight: "3.5rem",
        }}
      >
        <Home className="size-4 shrink-0" style={{ color: "var(--color-steel)" }} />
        <span className="leading-tight">Add Built Units</span>
      </button>
      {open && (
        <MobileNewUnitDialog
          open={open}
          onClose={() => setOpen(false)}
          projects={[{ id: projectId, name: projectName }]}
          defaultProjectId={projectId}
        />
      )}
    </>
  );
}
