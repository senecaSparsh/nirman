"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewUnitForm } from "@/app/m/units/MobileNewUnitDialog";

/**
 * MobileProjectUnitsFab — floating action button + spring-from-FAB modal for
 * creating a new built unit from the project detail page's Units tab.
 *
 * Opens the unit creation form inline (scoped to this project) instead of
 * navigating to /m/units, so users stay on the project page.
 */
export function MobileProjectUnitsFab({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
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
          projects={[{ id: projectId, name: projectName }]}
          defaultProjectId={projectId}
        />
      </MobileFabModal>
    </>
  );
}
