"use client";

import { useState } from "react";
import { Home, Globe } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BuiltUnitsView } from "@/components/built-units/built-units-view";
import { PortalListingsView } from "@/components/portal-listings/portal-listings-view";
import type { BuiltUnitRow, ProjectOption, PhaseOption } from "@/lib/types";

type PortalListingRow = {
  id: string;
  builtUnitId: string;
  unitNumber: string;
  unitType: string;
  unitStatus: string;
  projectName: string;
  portalName: string;
  listingId: string | null;
  listingUrl: string | null;
  status: "DRAFT" | "LISTED" | "DELISTED" | "SYNC_FAILED";
  title: string;
  description: string | null;
  askingPrice: number;
  area: number;
  areaUnit: string;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  photos: string[];
  listedAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
};

type PortalUnitOption = {
  id: string;
  label: string;
  unitNumber: string;
  unitType: string;
  askingPrice: number;
  area: number;
  areaUnit: string;
  floor: number | null;
};

export function UnitsHub({
  units,
  projects,
  phases,
  customers,
  unitPermissions,
  portalListings,
  portalUnitOptions,
  portalProjects,
  portalPermissions,
  canViewPortals,
}: {
  units: BuiltUnitRow[];
  projects: ProjectOption[];
  phases: PhaseOption[];
  customers: { id: string; name: string }[];
  unitPermissions: { canCreate?: boolean; canEdit?: boolean; canSell?: boolean };
  portalListings: PortalListingRow[];
  portalUnitOptions: PortalUnitOption[];
  portalProjects: { id: string; name: string }[];
  portalPermissions: { canManage: boolean };
  canViewPortals: boolean;
}) {
  const [tab, setTab] = useState("units");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="units">
          <span className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5" /> Built Units
          </span>
        </TabsTrigger>
        {canViewPortals && (
          <TabsTrigger value="portals">
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Portal Listings
            </span>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="units">
        <BuiltUnitsView
          units={units}
          projects={projects}
          phases={phases}
          customers={customers}
          permissions={unitPermissions}
        />
      </TabsContent>

      {canViewPortals && (
        <TabsContent value="portals">
          <PortalListingsView
            listings={portalListings}
            unitOptions={portalUnitOptions}
            projects={portalProjects}
            permissions={portalPermissions}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
