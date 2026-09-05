"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewVehicleForm } from "./MobileNewVehicleDialog";

/**
 * MobileVehiclesFab — floating action button + spring-from-FAB modal for
 * manually creating a new Vehicle master record from the mobile vehicles
 * page. Extracted as a client component so it can be dropped into the
 * (already client) vehicles page.
 */
export function MobileVehiclesFab() {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new vehicle" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Vehicle"
      >
        <MobileNewVehicleForm onClose={fab.close} />
      </MobileFabModal>
    </>
  );
}
