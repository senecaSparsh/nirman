"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
  const pathname = usePathname();

  return (
    <div className="mb-4">
      <MobileSelectWithCreate
        label="Project"
        value={selectedId ?? ""}
        onChange={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          if (id) params.set("project", id);
          else params.delete("project");
          router.push(`${pathname}?${params.toString()}`);
        }}
        placeholder="— Select project —"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        inputClass="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
        inputStyle={{
          borderColor: "var(--color-line)",
          backgroundColor: "transparent",
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
