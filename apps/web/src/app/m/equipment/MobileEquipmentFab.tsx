"use client";

import { useRouter } from "next/navigation";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import MobileNewEquipmentClient from "./new/MobileNewEquipmentClient";

/**
 * Client-side FAB + spring-from-FAB modal for registering new equipment.
 *
 * The equipment list page is a Server Component, so the FAB + modal
 * (which need client hooks) live here. The new-equipment form needs
 * no server-fetched data, so it renders entirely client-side.
 */
export function MobileEquipmentFab() {
  const fab = useFabModal();
  const router = useRouter();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add equipment" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Equipment"
      >
        <MobileNewEquipmentClient
          onClose={fab.close}
          onCreated={() => router.refresh()}
        />
      </MobileFabModal>
    </>
  );
}
