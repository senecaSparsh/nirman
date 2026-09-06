"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

export type BoqProjectOption = { id: string; name: string; code?: string | null };

/**
 * Mobile BOQ project selector — a SelectorCard + SelectorModal picker that
 * navigates to `?project=ID` on change. Uses `useRouter` + `useSearchParams`
 * so it stays in sync with the current URL.
 */
export function MobileBoqProjectSelector({
  projects,
  selectedId,
}: {
  projects: BoqProjectOption[];
  selectedId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

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
          router.push(`${pathname}${qs ? `?${qs}` : ""}`);
        }}
        placeholder="Select a project…"
        options={projects.map((p) => ({
          value: p.id,
          label: p.code ? `${p.code} — ${p.name}` : p.name,
        }))}
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
