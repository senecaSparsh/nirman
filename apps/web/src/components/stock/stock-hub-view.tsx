"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { Boxes, ScrollText, Truck, Package, Hammer, ClipboardCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OnHandTab } from "./on-hand-tab";
import { TransfersTab } from "./transfers-tab";
import { IssuesTab } from "./issues-tab";
import { StockMovementsView } from "@/components/stock-movements/stock-movements-view";
import { StockCountsView } from "@/components/stock-counts/stock-counts-view";
import { ScrapGenerationsView } from "@/components/scrap-generations/scrap-generations-view";
import type {
  StockRow,
  StockLocationRow,
  StockMovementRow,
  ProjectOption,
  DepartmentOption,
  TransferRow,
  MaterialIssueListRow,
  MaterialOption,
  StockLocationOption,
  StockCountRow,
} from "@/lib/types";

// Pull the local-only row types straight from the reused views so we never
// duplicate a shape.
type ScrapRow = ComponentProps<typeof ScrapGenerationsView>["scraps"];
type ScrapLocation = ComponentProps<typeof ScrapGenerationsView>["locations"];
type ScrapMaterial = ComponentProps<typeof ScrapGenerationsView>["materials"];
type ScrapProject = ComponentProps<typeof ScrapGenerationsView>["projects"];
type CountLocation = ComponentProps<typeof StockCountsView>["locations"];

const TABS = ["on-hand", "movements", "transfers", "issues", "scrap", "counts"] as const;
type TabValue = (typeof TABS)[number];

export function StockHubView({
  stock,
  locations,
  transferLocations,
  movements,
  projects,
  departments,
  transfers,
  issues,
  materialOptions,
  locationOptions,
  scraps,
  scrapLocations,
  scrapMaterials,
  scrapProjects,
  counts,
  countLocations,
  permissions,
}: {
  stock: StockRow[];
  locations: StockLocationRow[];
  /** Group-wide locations — inter-company STO destinations are selectable. */
  transferLocations: StockLocationRow[];
  movements: StockMovementRow[];
  projects: ProjectOption[];
  departments: DepartmentOption[];
  transfers: TransferRow[];
  issues: MaterialIssueListRow[];
  materialOptions: MaterialOption[];
  locationOptions: StockLocationOption[];
  scraps: ScrapRow;
  scrapLocations: ScrapLocation;
  scrapMaterials: ScrapMaterial;
  scrapProjects: ScrapProject;
  counts: StockCountRow[];
  countLocations: CountLocation;
  permissions: {
    canTransfer: boolean;
    canIssue: boolean;
    canManage: boolean;
  };
}) {
  const searchParams = useSearchParams();

  // Initial tab from ?tab= (validated against the known set), defaulting to
  // "on-hand". ?issue=1 forces the Issues tab and auto-opens the issue form
  // (used by the GRN "Issue to Project" toast action).
  const requested = searchParams.get("tab") as TabValue | null;
  const autoIssue = searchParams.get("issue") === "1";
  const initialTab: TabValue = autoIssue
    ? "issues"
    : requested && TABS.includes(requested)
      ? requested
      : "on-hand";

  const [tab, setTab] = useState<TabValue>(initialTab);

  // Keep the tab in sync if the query changes (e.g. navigating from elsewhere)
  useEffect(() => {
    const r = searchParams.get("tab") as TabValue | null;
    const ai = searchParams.get("issue") === "1";
    setTab(ai ? "issues" : r && TABS.includes(r) ? r : "on-hand");
  }, [searchParams]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
      <TabsList>
        <TabsTrigger value="on-hand">
          <span className="flex items-center gap-1.5">
            <Boxes className="h-3.5 w-3.5" /> On Hand
          </span>
        </TabsTrigger>
        <TabsTrigger value="movements">
          <span className="flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5" /> Movements
          </span>
        </TabsTrigger>
        <TabsTrigger value="transfers">
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Transfers
          </span>
        </TabsTrigger>
        <TabsTrigger value="issues">
          <span className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" /> Issues
          </span>
        </TabsTrigger>
        <TabsTrigger value="scrap">
          <span className="flex items-center gap-1.5">
            <Hammer className="h-3.5 w-3.5" /> Scrap
          </span>
        </TabsTrigger>
        <TabsTrigger value="counts">
          <span className="flex items-center gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Counts
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="on-hand">
        <OnHandTab stock={stock} locations={locations} />
      </TabsContent>
      <TabsContent value="movements">
        <StockMovementsView
          movements={movements}
          locations={locations}
          projects={projects}
          departments={departments}
          permissions={{ canTransfer: permissions.canTransfer, canIssue: permissions.canIssue }}
        />
      </TabsContent>
      <TabsContent value="transfers">
        <TransfersTab transfers={transfers} locations={transferLocations} canTransfer={permissions.canTransfer} />
      </TabsContent>
      <TabsContent value="issues">
        <IssuesTab
          issues={issues}
          projects={projects}
          departments={departments}
          materialOptions={materialOptions}
          locationOptions={locationOptions}
          canIssue={permissions.canIssue}
          autoOpenForm={autoIssue}
        />
      </TabsContent>
      <TabsContent value="scrap">
        <ScrapGenerationsView
          scraps={scraps}
          locations={scrapLocations}
          materials={scrapMaterials}
          projects={scrapProjects}
          permissions={{ canManage: permissions.canManage }}
        />
      </TabsContent>
      <TabsContent value="counts">
        <StockCountsView
          counts={counts}
          locations={countLocations}
          permissions={{ canCreate: permissions.canManage, canManage: permissions.canManage }}
        />
      </TabsContent>
    </Tabs>
  );
}
