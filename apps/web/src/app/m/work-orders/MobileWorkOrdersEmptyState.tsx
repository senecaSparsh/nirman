"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Plus } from "lucide-react";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileNewSubcontractorDialog } from "./MobileNewSubcontractorDialog";

/**
 * Client-side empty state for the mobile work-orders page.
 *
 * When subcontractors are missing, opens an inline dialog instead of
 * redirecting to /m/suppliers/new. When projects are missing, links to
 * the projects list (a navigation, not a creation redirect).
 */
export function MobileWorkOrdersEmptyState({
  canManage,
  hasProjects,
  hasSubcontractors,
}: {
  canManage: boolean;
  hasProjects: boolean;
  hasSubcontractors: boolean;
}) {
  const router = useRouter();
  const [showCreateSub, setShowCreateSub] = useState(false);

  const hint = canManage
    ? !hasProjects
      ? "Create a project first, then issue work orders to subcontractors"
      : !hasSubcontractors
        ? "Add a subcontractor first, then issue work orders"
        : "Tap + to issue a work order to a subcontractor"
    : "Work orders will appear here";

  return (
    <>
      <MobileEmptyState
        icon={Wrench}
        title="No work orders"
        hint={hint}
        action={
          canManage ? (
            !hasProjects ? (
              <MobileCta href="/m/real-estate?tab=projects" icon={Plus} variant="primary">Go to Projects</MobileCta>
            ) : !hasSubcontractors ? (
              <button
                onClick={() => setShowCreateSub(true)}
                className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 px-4 text-m-body font-bold text-m-body press"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                <Plus className="size-3.5" /> Add Subcontractor
              </button>
            ) : undefined
          ) : undefined
        }
      />

      {showCreateSub ? (
        <MobileNewSubcontractorDialog
          open
          onClose={() => setShowCreateSub(false)}
          onCreated={() => {
            setShowCreateSub(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
