"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewHazardForm } from "./MobileNewHazardDialog";

export function MobileHazardFab({ projects }: { projects: { id: string; name: string }[] }) {
  const fab = useFabModal();
  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Report new hazard" />
      <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Report Hazard">
        <MobileNewHazardForm onClose={fab.close} projects={projects} />
      </MobileFabModal>
    </>
  );
}
