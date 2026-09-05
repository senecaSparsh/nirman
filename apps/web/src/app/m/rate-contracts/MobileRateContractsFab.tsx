"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewRateContractForm } from "./MobileNewRateContractDialog";

export function MobileRateContractsFab({
  suppliers,
  materials,
}: {
  suppliers: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new rate contract" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Rate Contract"
      >
        <MobileNewRateContractForm
          onClose={fab.close}
          suppliers={suppliers}
          materials={materials}
        />
      </MobileFabModal>
    </>
  );
}
