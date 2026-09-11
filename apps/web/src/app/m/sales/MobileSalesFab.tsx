"use client";

import { useRouter } from "next/navigation";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import MobileNewSaleClient from "./new/MobileNewSaleClient";

/**
 * MobileSalesFab — floating action button + spring-from-FAB modal for
 * creating a new asset sale (booking).
 *
 * The sales hub is a Server Component, so the FAB + modal (which need
 * client hooks) live here. The form (MobileNewSaleClient) fetches its
 * own options client-side via /api/sales/new-options, so no server data
 * needs to be passed in.
 *
 * Supports optional initial params for pre-seeding when opened from a
 * context (e.g. a specific project or unit).
 */
export function MobileSalesFab({
  initialBuiltUnitId,
  initialLandParcelId,
  initialCustomerId,
  initialProjectId,
}: {
  initialBuiltUnitId?: string;
  initialLandParcelId?: string;
  initialCustomerId?: string;
  initialProjectId?: string;
} = {}) {
  const fab = useFabModal();
  const router = useRouter();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="New sale" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Sale"
      >
        <MobileNewSaleClient
          initialBuiltUnitId={initialBuiltUnitId}
          initialLandParcelId={initialLandParcelId}
          initialCustomerId={initialCustomerId}
          initialProjectId={initialProjectId}
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
