"use client";

import { type ComponentProps, Fragment, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTabParam } from "@/lib/use-tab-param";
import { formatCurrency } from "@/lib/utils";
import { Boxes, ScrollText, Truck, Package, Hammer, ClipboardCheck, Building2 } from "lucide-react";
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

const TABS = ["on-hand", "movements", "transfers", "issues", "scrap", "counts", "cross-company"] as const;
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
  hasChildren = false,
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
  hasChildren?: boolean;
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
        {hasChildren && (
          <TabsTrigger value="cross-company">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Cross-Company
            </span>
          </TabsTrigger>
        )}
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
      {hasChildren && (
        <TabsContent value="cross-company">
          <CrossCompanyTab />
        </TabsContent>
      )}
    </Tabs>
  );
}

/* ════════════════════════════════════════════════════════════
 * Cross-Company tab — aggregated stock across child companies.
 * Fetches from /api/inventory/cross-company (parent-only).
 * ════════════════════════════════════════════════════════════ */
function CrossCompanyTab() {
  const [data, setData] = useState<{
    companies: { id: string; name: string }[];
    materials: {
      materialId: string;
      materialName: string;
      materialCode: string | null;
      unit: string;
      categoryName: string | null;
      totalQty: number;
      totalValue: number;
      companies: { companyId: string; companyName: string; qty: number; value: number }[];
    }[];
    summary: { totalMaterials: number; totalValue: number; totalQty: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`/api/inventory/cross-company?${params.toString()}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        return json;
      })
      .then((d) => setData(d))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [search]);

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading cross-company inventory…</div>;
  }
  if (error) {
    return <div className="py-8 text-center text-sm text-red-600">{error}</div>;
  }
  if (!data || data.materials.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No stock found across child companies.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-b border-border pb-2">
        <span><strong className="text-foreground tabular-nums">{data.summary.totalMaterials}</strong> materials</span>
        <span className="text-border">·</span>
        <span><strong className="text-foreground tabular-nums">{data.companies.length}</strong> child companies</span>
        <span className="text-border">·</span>
        <span><strong className="text-foreground tabular-nums">{formatCurrency(data.summary.totalValue)}</strong> total value</span>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search material…"
          className="h-8 w-full px-3 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-muted-foreground">Material</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">Category</th>
              <th className="px-3 py-2 font-medium text-muted-foreground text-right">Total Qty</th>
              <th className="px-3 py-2 font-medium text-muted-foreground text-right">Total Value</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">Companies</th>
            </tr>
          </thead>
          <tbody>
            {data.materials.map((m) => {
              const isExpanded = expanded.has(m.materialId);
              return (
                <Fragment key={m.materialId}>
                  <tr
                    className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.materialId)) next.delete(m.materialId);
                        else next.add(m.materialId);
                        return next;
                      });
                    }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{m.materialName}</div>
                      {m.materialCode && <div className="font-mono text-[10px] text-muted-foreground">{m.materialCode}</div>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.categoryName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.totalQty.toLocaleString("en-IN")} {m.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(m.totalValue)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.companies.length}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={5} className="px-6 py-2">
                        <div className="space-y-1">
                          {m.companies.map((c) => (
                            <div key={c.companyId} className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">{c.companyName}</span>
                              <span className="tabular-nums">
                                {c.qty.toLocaleString("en-IN")} {m.unit} · {formatCurrency(c.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
