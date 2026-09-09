"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewEmployeeForm } from "./MobileNewEmployeeDialog";

/**
 * MobileEmployeesFab — FAB + spring-from-FAB modal for creating a new
 * employee from the mobile HR page.
 *
 * Mirrors MobileMaterialsFab: the FAB morphs +→× on open, and the
 * modal scales up from the FAB's on-screen position with a
 * critically-damped spring (cubic-bezier(0.32, 0.72, 0, 1)) +
 * backdrop blur — Apple-style symmetric enter/exit paths.
 */
export function MobileEmployeesFab({
  projects,
  stockLocations,
  departments,
  companyGroup,
}: {
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string; type: string }[];
  departments: { id: string; name: string; active: boolean }[];
  companyGroup: { id: string; name: string; parentCompanyId: string | null }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new employee" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Employee"
      >
        <MobileNewEmployeeForm
          onClose={fab.close}
          projects={projects}
          stockLocations={stockLocations}
          departments={departments}
          companyGroup={companyGroup}
        />
      </MobileFabModal>
    </>
  );
}
