"use client";

import { type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { useTabParam } from "@/lib/use-tab-param";
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
  categories,
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
  categories: { id: string; name: string; unit: string }[];
  permissions: {
    canTransfer: boolean;
    canIssue: boolean;
    canManage: boolean;
  };
}) {
  const searchParams = useSearchParams();

  /**
   * The tab lives in `?tab=`, so a tab is a shareable location. v1 only
   * *read* the param — clicking a tab left the URL on the previous one,
   * so refresh and the back button both lied about where you were.
   *
   * `?issue=1` still forces the Issues tab and auto-opens the issue form
   * (used by the GRN "Issue to Project" toast action).
   */
  const [urlTab, setUrlTab] = useTabParam(TABS, "on-hand");
  const autoIssue = searchParams.get("issue") === "1";
  const tab: TabValue = autoIssue ? "issues" : urlTab;

  return (
    <Tabs value={tab} onValueChange={(v) => setUrlTab(v as TabValue)}>
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
        <TransfersTab transfers={transfers} locations={transferLocations} projects={projects} canTransfer={permissions.canTransfer} />
      </TabsContent>
      <TabsContent value="issues">
        <IssuesTab
          issues={issues}
          projects={projects}
          departments={departments}
          materialOptions={materialOptions}
          locationOptions={locationOptions}
          categories={categories}
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
          categories={categories}
          permissions={{ canManage: permissions.canManage }}
        />
      </TabsContent>
      <TabsContent value="counts">
        <StockCountsView
          counts={counts}
          locations={countLocations}
          projects={projects}
          permissions={{ canCreate: permissions.canManage, canManage: permissions.canManage }}
        />
      </TabsContent>
    </Tabs>
  );
}
