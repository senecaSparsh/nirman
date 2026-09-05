"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewNcrForm } from "./MobileNewNcrDialog";

export function MobileNcrFab({
  projects,
  subcontractors,
}: {
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Raise new NCR" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Raise NCR"
      >
        <MobileNewNcrForm
          onClose={fab.close}
          projects={projects}
          subcontractors={subcontractors}
        />
      </MobileFabModal>
    </>
  );
}
