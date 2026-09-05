"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewStandardConsumptionForm } from "./MobileNewStandardConsumptionDialog";

/**
 * Client-side FAB + spring-from-FAB modal for creating a new standard
 * consumption benchmark.
 *
 * The standard-consumptions list page is a Server Component, so the
 * FAB + modal (which need client hooks) live here. The page fetches
 * materials server-side and passes them in.
 */
export function MobileStandardConsumptionsFab({
  materials,
}: {
  materials: { id: string; name: string; unit: string }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add standard consumption" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Standard Consumption"
      >
        <MobileNewStandardConsumptionForm onClose={fab.close} materials={materials} />
      </MobileFabModal>
    </>
  );
}
