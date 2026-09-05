"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewLeaveForm } from "./MobileNewLeaveDialog";

/**
 * MobileLeavesFab — FAB + spring-from-FAB modal for recording a leave
 * from the mobile HR page.
 *
 * Mirrors MobileMaterialsFab / MobileEmployeesFab: the FAB morphs +→×
 * on open, and the modal scales up from the FAB's on-screen position
 * with a critically-damped spring (cubic-bezier(0.32, 0.72, 0, 1)) +
 * backdrop blur — Apple-style symmetric enter/exit paths.
 */
export function MobileLeavesFab({
  employees,
}: {
  employees: { id: string; name: string; trade: string | null }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new leave" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Record Leave"
      >
        <MobileNewLeaveForm onClose={fab.close} employees={employees} />
      </MobileFabModal>
    </>
  );
}
