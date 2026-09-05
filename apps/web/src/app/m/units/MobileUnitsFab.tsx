"use client";

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
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const fab = useFabModal();

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
        />
      </MobileFabModal>
    </>
  );
}
