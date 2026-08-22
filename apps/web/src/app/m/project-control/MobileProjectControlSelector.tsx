"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

export function MobileProjectControlSelector({
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
        value={selectedId ?? ""}
        onChange={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          if (id) params.set("project", id);
          else params.delete("project");
          router.push(`/m/project-control?${params.toString()}`);
        }}
        placeholder="— Select project —"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        inputClass="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] font-semibold outline-none"
        inputStyle={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink-950)",
        }}
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
