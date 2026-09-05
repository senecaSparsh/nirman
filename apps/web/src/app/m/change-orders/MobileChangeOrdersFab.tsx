"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewChangeOrderForm } from "./MobileNewChangeOrderDialog";

export function MobileChangeOrdersFab({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new change order" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Change Order"
      >
        <MobileNewChangeOrderForm onClose={fab.close} projects={projects} />
      </MobileFabModal>
    </>
  );
}
