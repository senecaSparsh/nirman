"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { MobileNewUnitDialog } from "./MobileNewUnitDialog";

/**
 * MobileUnitsFab — floating action button + dialog launcher for creating
 * a new built unit from the mobile units page. Extracted as a client
 * component because the units page is a Server Component.
 */
export function MobileUnitsFab({
  projects,
  defaultProjectId,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "#fff",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
        aria-label="Add new unit"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileNewUnitDialog
          open={open}
          onClose={() => setOpen(false)}
          projects={projects}
          defaultProjectId={defaultProjectId}
        />
      )}
    </>
  );
}
