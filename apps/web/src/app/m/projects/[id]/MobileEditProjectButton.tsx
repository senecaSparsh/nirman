"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { MobileEditProjectDialog, type ProjectEditData } from "./MobileEditProjectDialog";

/**
 * MobileEditProjectButton — renders an "Edit Project" button in the
 * project detail hero card and launches the edit dialog. Extracted as
 * a client component because the project detail page is a Server Component.
 */
export function MobileEditProjectButton({ project }: { project: ProjectEditData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-[0.5rem] border-2 text-[0.6875rem] font-bold press"
        style={{
          borderColor: "var(--color-line)",
          color: "var(--color-ink-700)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <Pencil className="size-3.5" />
        Edit
      </button>

      {open && (
        <MobileEditProjectDialog
          open={open}
          onClose={() => setOpen(false)}
          project={project}
        />
      )}
    </>
  );
}
