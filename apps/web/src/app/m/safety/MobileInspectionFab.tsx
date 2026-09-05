"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewInspectionForm } from "./MobileNewInspectionDialog";

export function MobileInspectionFab({ projects }: { projects: { id: string; name: string }[] }) {
  const fab = useFabModal();
  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Schedule new inspection" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Schedule Inspection"
      >
        <MobileNewInspectionForm onClose={fab.close} projects={projects} />
      </MobileFabModal>
    </>
  );
}
