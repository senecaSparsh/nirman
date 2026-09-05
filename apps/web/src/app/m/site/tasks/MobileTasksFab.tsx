"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewTaskForm } from "./MobileNewTaskDialog";

/**
 * MobileTasksFab — floating action button + spring-from-FAB modal for
 * assigning a new task from the mobile tasks page.
 *
 * Mirrors MobileMaterialsFab: uses <MobileFab> + <MobileFabModal> +
 * useFabModal() instead of a custom fixed button + bottom-sheet.
 */
export function MobileTasksFab({
  assignees,
}: {
  assignees: { id: string; name: string; role: string }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Assign new task" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Assign Task"
      >
        <MobileNewTaskForm onClose={fab.close} assignees={assignees} />
      </MobileFabModal>
    </>
  );
}
