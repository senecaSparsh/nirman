"use client";

import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewMaterialForm } from "./MobileNewMaterialDialog";

/**
 * Client-side FAB + spring-from-FAB modal for creating a new material.
 *
 * The materials list page is a Server Component, so the FAB + modal
 * (which need client hooks) live here. The page fetches categories
 * server-side and passes them in.
 */
export function MobileMaterialsFab({
  categories,
  locations = [],
}: {
  categories: { id: string; name: string; unit: string }[];
  locations?: { id: string; name: string; projectName?: string | null }[];
}) {
  const fab = useFabModal();

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add new material" />
      <MobileFabModal
        open={fab.isOpen}
        onClose={fab.close}
        originRect={fab.originRect}
        title="New Material"
      >
        <MobileNewMaterialForm
          onClose={fab.close}
          categories={categories}
          showOpeningStock
          locations={locations}
        />
      </MobileFabModal>
    </>
  );
}
