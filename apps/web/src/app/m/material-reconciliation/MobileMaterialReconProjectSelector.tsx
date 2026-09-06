"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

export type MaterialReconProjectOption = { id: string; name: string };

/**
 * Mobile Material Reconciliation project selector — a SelectorCard +
 * SelectorModal picker that navigates to `?project=ID` on change.
 */
export function MobileMaterialReconProjectSelector({
  projects,
  selectedId,
}: {
  projects: MaterialReconProjectOption[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const current = selectedId ?? searchParams.get("project") ?? "";

  return (
    <div className="mb-4">
      <MobileSelectWithCreate
        label="Project"
        icon={FolderOpen}
        value={current}
        onChange={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          if (id) {
            params.set("project", id);
          } else {
            params.delete("project");
          }
          const qs = params.toString();
          router.push(`/m/material-reconciliation${qs ? `?${qs}` : ""}`);
        }}
        placeholder="Select a project…"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        renderDialog={({ open, onClose, onCreated }) => (
          <MobileNewProjectDialog
            open={open}
            onClose={onClose}
            onCreated={(p) => onCreated(p.id, p.name)}
          />
        )}
      />
    </div>
  );
}
