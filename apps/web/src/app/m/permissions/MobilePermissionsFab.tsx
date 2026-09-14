"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewLegalDocForm } from "./MobileNewLegalDocDialog";

export function MobilePermissionsFab({
  projects,
  landPurchases,
}: {
  projects: { id: string; name: string }[];
  landPurchases: { id: string; sellerName: string; location: string | null }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add legal document" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="Add Legal Document"
      >
        <MobileNewLegalDocForm
          onClose={fab.close}
          projects={projects}
          landPurchases={landPurchases}
        />
      </MobileFabModal>
    </>
  );
}
