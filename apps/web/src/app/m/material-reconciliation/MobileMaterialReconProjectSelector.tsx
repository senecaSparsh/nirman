"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";

export type MaterialReconProjectOption = { id: string; name: string };

/**
 * Mobile Material Reconciliation project selector — a native <select> dropdown
 * that navigates to `?project=ID` on change. Uses `useRouter` +
 * `useSearchParams` so it stays in sync with the current URL. Follows the warm
 * mobile v2 styling.
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
    <div
      className="flex items-center gap-2.5 rounded-[0.625rem] border-2 p-2.5 mb-4"
      style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
    >
      <span
        className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <FolderOpen className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <label
          htmlFor="material-recon-project-select"
          className="block text-[0.5rem] uppercase tracking-wide font-semibold mb-0.5"
          style={{ color: "var(--color-ink-500)" }}
        >
          Project
        </label>
        <select
          id="material-recon-project-select"
          value={current}
          onChange={(e) => {
            const id = e.target.value;
            const params = new URLSearchParams(searchParams.toString());
            if (id) {
              params.set("project", id);
            } else {
              params.delete("project");
            }
            const qs = params.toString();
            router.push(`/m/material-reconciliation${qs ? `?${qs}` : ""}`);
          }}
          className="w-full bg-transparent text-[0.875rem] font-semibold outline-none truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
