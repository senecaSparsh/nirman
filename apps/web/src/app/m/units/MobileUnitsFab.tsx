"use client";

import { useEffect } from "react";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewUnitForm } from "./MobileNewUnitDialog";

/**
 * MobileUnitsFab — floating action button + spring-from-FAB modal for
 * creating a new built unit from the mobile units page. Extracted as a
 * client component because the units page is a Server Component.
 */
export function MobileUnitsFab({
  projects,
  defaultProjectId,
  autoOpen,
  initialUnit,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  /** ?new=1 deep-link — opens the create dialog on mount. */
  autoOpen?: boolean;
  /** Deep-link field prefill (?type=&number=&area=&price=). */
  initialUnit?: { unitType?: string; unitNumber?: string; area?: string; askingPrice?: string };
}) {
  const fab = useFabModal();

  useEffect(() => {
    if (autoOpen) fab.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new unit" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Built Unit"
      >
        <MobileNewUnitForm
          onClose={fab.close}
          projects={projects}
          defaultProjectId={defaultProjectId}
          initialUnit={initialUnit}
        />
      </MobileFabModal>
    </>
  );
}
