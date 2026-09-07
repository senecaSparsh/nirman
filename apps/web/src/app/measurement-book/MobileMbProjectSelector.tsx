"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

export function MobileMbProjectSelector({
  projects,
  selectedId,
  canCreate = false,
}: {
  projects: { id: string; name: string }[];
  selectedId: string | null;
  canCreate?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="mb-4">
      <MobileSelectWithCreate
        label="Project"
        icon={FolderOpen}
        value={selectedId ?? ""}
        onChange={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          if (id) params.set("project", id);
          else params.delete("project");
          router.push(`/m/measurement-book?${params.toString()}`);
        }}
        placeholder="— Select project —"
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
