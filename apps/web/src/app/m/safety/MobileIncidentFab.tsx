"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewIncidentForm } from "./MobileNewIncidentDialog";

export function MobileIncidentFab({ projects }: { projects: { id: string; name: string }[] }) {
  const fab = useFabModal();
  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Report new incident" />
      <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Report Incident">
        <MobileNewIncidentForm onClose={fab.close} projects={projects} />
      </MobileFabModal>
    </>
  );
}
