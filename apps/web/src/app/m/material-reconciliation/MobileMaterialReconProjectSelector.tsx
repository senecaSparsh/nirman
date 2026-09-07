"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

export type MaterialReconProjectOption = { id: string; name: string };

/**
 * Mobile Material Reconciliation project selector — a SelectorCard +
 * SelectorModal picker that navigates to `?project=ID` on change.
 */
export function MobileMaterialReconProjectSelector({
  projects,
  selectedId,
  canCreate = false,
}: {
  projects: MaterialReconProjectOption[];
  selectedId: string | null;
  canCreate?: boolean;
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
        renderDialog={canCreate ? ({ open, onClose, onCreated, originRect }) => (
          <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project" nested>
            <MobileNewProjectDialog
              open={open}
              onClose={onClose}
              onCreated={(p) => onCreated(p.id, p.name)}
            />
          </MobileFabModal>
        ) : undefined}
      />
    </div>
  );
}
