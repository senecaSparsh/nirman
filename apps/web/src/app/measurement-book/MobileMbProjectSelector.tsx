"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

export function MobileMbProjectSelector({
  projects,
  selectedId,
}: {
  projects: { id: string; name: string }[];
  selectedId: string | null;
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
