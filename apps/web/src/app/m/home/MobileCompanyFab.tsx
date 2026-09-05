"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewCompanyForm } from "./MobileNewCompanyDialog";

/**
 * MobileCompanyFab — floating action button + spring-from-FAB modal for
 * creating a new company from the mobile home page. Mirrors the
 * MobileMaterialsFab pattern.
 */
export function MobileCompanyFab({
  parentOptions = [],
}: {
  parentOptions?: { id: string; name: string }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new company" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Company"
      >
        <MobileNewCompanyForm onClose={fab.close} parentOptions={parentOptions} />
      </MobileFabModal>
    </>
  );
}
