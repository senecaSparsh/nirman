"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { MobileNewTaskDialog } from "./MobileNewTaskDialog";

/**
 * MobileTasksFab — floating action button + dialog launcher for
 * assigning a new task from the mobile tasks page.
 */
export function MobileTasksFab({
  assignees,
}: {
  assignees: { id: string; name: string; role: string }[];
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
        aria-label="Assign new task"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileNewTaskDialog
          open={open}
          onClose={() => setOpen(false)}
          assignees={assignees}
        />
      )}
    </>
  );
}
