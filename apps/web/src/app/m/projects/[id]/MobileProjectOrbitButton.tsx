"use client";

import { useState } from "react";
import { Orbit } from "lucide-react";
import { OrbitNavigator } from "@/components/mobile/v2/orbit-navigator";

/**
 * Opens the orbit explorer rooted at this project — its built units, work
 * orders, materials, expenses, subcontractor scope, and phases arranged as
 * orbiting chips. Same designer navigation as the home company orbit.
 */
export function MobileProjectOrbitButton({
  projectId,
  projectName,
  subtitle,
}: {
  projectId: string;
  projectName: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Explore ${projectName}'s orbit`}
        title="Explore this project's orbit"
        className="grid place-items-center size-9 rounded-full border press active:scale-95"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
      >
        <Orbit className="size-4" />
      </button>
      {open ? (
        <OrbitNavigator
          initialNode={{ id: projectId, type: "project", title: projectName, subtitle: subtitle ?? "Project", meta: "" }}
          inline={false}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
