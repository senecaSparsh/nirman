"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { MobileNewIncidentDialog } from "./MobileNewIncidentDialog";

export function MobileIncidentFab({ projects }: { projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press" style={{ bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)", backgroundColor: "var(--color-ink-950)", color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} aria-label="Report new incident">
        <Plus className="size-5" />
      </button>
      {open && <MobileNewIncidentDialog open={open} onClose={() => setOpen(false)} projects={projects} />}
    </>
  );
}
