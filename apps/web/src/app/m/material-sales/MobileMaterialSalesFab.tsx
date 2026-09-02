"use client";

import { useRouter } from "next/navigation";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import MobileNewMaterialSaleClient from "./new/MobileNewMaterialSaleClient";

/**
 * Client-side FAB + spring-from-FAB modal for creating a new material sale.
 *
 * The material-sales list page is a Server Component, so the FAB + modal
 * (which need client hooks) live here. The form (MobileNewMaterialSaleClient)
 * fetches its own options client-side, so no server data needs to be passed in.
 */
export function MobileMaterialSalesFab() {
  const fab = useFabModal();
  const router = useRouter();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="New material sale" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Material Sale"
      >
        <MobileNewMaterialSaleClient
          onClose={fab.close}
          onCreated={() => {
            // Refresh server-rendered cache so the list shows the new sale
            router.refresh();
          }}
        />
      </MobileFabModal>
    </>
  );
}
