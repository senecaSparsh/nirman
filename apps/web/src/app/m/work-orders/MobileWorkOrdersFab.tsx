"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewWorkOrderForm } from "./MobileNewWorkOrderDialog";

export function MobileWorkOrdersFab({
  projects,
  subcontractors,
}: {
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new work order" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Work Order"
      >
        <MobileNewWorkOrderForm
          onClose={fab.close}
          projects={projects}
          subcontractors={subcontractors}
        />
      </MobileFabModal>
    </>
  );
}
