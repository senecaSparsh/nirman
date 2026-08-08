"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, X, LandPlot, Layers, Trash2, SplitSquareHorizontal, CircleDollarSign, ArrowRight, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { SellAssetDialog } from "@/components/sales/sell-asset-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill, statusColor } from "@/components/page";
import { LandPurchaseFormDialog } from "./land-purchase-form-dialog";
import { PartitionDialog } from "./partition-dialog";
import { PartitionCanvasDialog } from "./partition-canvas-dialog";
import { ParcelValuationDialog } from "./parcel-valuation-dialog";
import { LandPortfolioStrip } from "./land-portfolio-strip";
import { ParcelsTree } from "./parcels-tree";
import { LandDetailDrawer } from "./land-detail-drawer";
import { CadastreLegend, CadastrePlan } from "./cadastre-plan";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type {
  LandPurchaseRow as LandPurchaseRowType, LandParcelRow, LandParcelStatus, LandParcelSummary, LandPortfolio, ProjectOption, SellableAssetRow,
} from "@/lib/types";

/** Base column definitions for the land purchases DataTable. */
const landPurchaseColumns: Column<LandPurchaseRowType>[] = [
  {
    key: "plan",
    label: "",
    headClassName: "w-20",
    render: (p) => (
      <div className="h-14 w-20 overflow-hidden rounded border border-border/60">
        <CadastrePlan parcels={p.parcels} showLabels={false} />
      </div>
    ),
  },
  {
    key: "seller",
    label: "Seller",
    sortable: true,
    sortValue: (p) => p.sellerName,
    render: (p) => {
      const isPartitioned = p.partitionedCount > 0 || p.hasChildren;
      const allSold = p.parcelCount > 0 && p.soldCount === p.parcelCount;
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{p.sellerName}</span>
            {isPartitioned && <Layers className="h-3 w-3 shrink-0 text-muted-foreground" />}
            {allSold && <StatusPill status="SOLD" />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-caption text-muted-foreground">
            <span className="truncate">{p.projectName ?? "Standalone land"}</span>
            {p.location && (
              <span className="flex items-center gap-0.5 truncate">
                <MapPin className="h-2.5 w-2.5" />{p.location}
              </span>
            )}
            <span className="tnum">{formatDate(p.purchaseDate)}</span>
          </div>
        </div>
      );
    },
  },
  {
    key: "parcels",
    label: "Parcels",
    render: (p) => {
      if (p.parcelCount === 0) return <span className="text-muted-foreground">—</span>;
      const counts: { status: LandParcelStatus; n: number }[] = [
        { status: "AVAILABLE", n: p.availableCount },
        { status: "HOLD", n: p.holdCount },
        { status: "PARTITIONED", n: p.partitionedCount },
        { status: "SOLD", n: p.soldCount },
      ].filter((c) => c.n > 0) as { status: LandParcelStatus; n: number }[];
      if (counts.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-2.5">
          {counts.map((c) => (
            <span key={c.status} className="flex items-center gap-1 text-micro text-muted-foreground tnum">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: statusColor(c.status), opacity: 0.6 }}
              />
              {c.n}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    key: "valuationGain",
    label: "Gain",
    align: "right",
    sortable: true,
    render: (p) => {
      const gainPositive = p.valuationGain >= 0;
      return (
        <div className="text-right">
          <div className={`tnum font-semibold ${gainPositive ? "text-success" : "text-danger"}`}>
            {gainPositive ? "+" : ""}{formatCurrency(p.valuationGain)}
          </div>
          <div className="text-micro text-muted-foreground tnum">{formatCurrency(p.unsoldValue)} held</div>
        </div>
      );
    },
  },
];

/** Columns with per-row action buttons appended. */
function landColumnsWithActions(
  canEdit: boolean,
  canPartition: boolean,
  onEdit: (p: LandPurchaseRowType) => void,
  onSubdivide: (purchaseId: string) => void,
): Column<LandPurchaseRowType>[] {
  return [
    ...landPurchaseColumns,
    {
      key: "actions",
      label: "",
      align: "right",
      render: (p) => {
        const isPartitioned = p.partitionedCount > 0 || p.hasChildren;
        const canShowSubdivide = canPartition && !isPartitioned && p.availableCount > 0;
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            {canShowSubdivide && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSubdivide(p.id)}
                className="text-brand"
              >
                <SplitSquareHorizontal className="mr-1 h-3.5 w-3.5" /> Subdivide
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(p)}
                className="text-muted-foreground"
              >
                Edit
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/land/${p.id}`}>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];
}

export function LandView({
  purchases,
  parcels,
  parcelSummaries,
  projects,
  portfolio,
  customers,
  permissions,
}: {
  purchases: LandPurchaseRowType[];
  parcels: LandParcelRow[];
  parcelSummaries: LandParcelSummary[];
  projects: ProjectOption[];
  portfolio: LandPortfolio;
  customers?: { id: string; name: string }[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canPartition?: boolean; canSell?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const canPartition = permissions?.canPartition ?? true;
  const canSell = permissions?.canSell ?? false;

  const router = useRouter();
  const [tab, setTab] = useState("purchases");
  const [purchaseFilter, setPurchaseFilter] = useState<string | null>(null);
  const [quickView, setQuickView] = useState<LandPurchaseRowType | null>(null);

  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [canvasParcel, setCanvasParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);
  const [sellParcel, setSellParcel] = useState<LandParcelRow | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LandPurchaseRowType | null>(null);

  // Post-creation prompt: after recording a new purchase, ask the user whether
  // to subdivide immediately or keep it as a single whole plot.
  const [subdividePrompt, setSubdividePrompt] = useState<LandParcelRow | null>(null);

  // Convert a LandParcelRow into the SellableAssetRow shape for the SellAssetDialog.
  function toSellableAsset(p: LandParcelRow): SellableAssetRow {
    return {
      assetType: "LAND",
      assetId: p.id,
      label: `Plot ${p.number} — ${formatNumber(p.area, 0)} ${p.areaUnit}`,
      projectId: p.projectId,
      projectName: p.projectName,
      costBasis: p.acquisitionCost,
      askingPrice: p.askingPrice,
      currentValuation: p.currentValuation,
    };
  }

  // Find the root parcel (no parent) for a purchase — this is the parcel that
  // gets partitioned when the user clicks "Subdivide".
  function rootParcelForPurchase(purchaseId: string): LandParcelRow | null {
    return parcels.find((p) => p.landPurchaseId === purchaseId && p.parentParcelId === null) ?? null;
  }

  // Handle "Subdivide" click from a purchase row — find the root parcel and
  // open the partition dialog.
  function handleSubdividePurchase(purchaseId: string) {
    const root = rootParcelForPurchase(purchaseId);
    if (root) setPartitionParcel(root);
  }

  return (
    <div className="space-y-6">
      <LandPortfolioStrip portfolio={portfolio} parcels={parcelSummaries} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="purchases">
              <span className="flex items-center gap-1.5"><LandPlot className="h-3.5 w-3.5" /> Purchases</span>
            </TabsTrigger>
            <TabsTrigger value="parcels">
              <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Parcels</span>
            </TabsTrigger>
          </TabsList>

          {canCreate && purchases.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> New Purchase
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="purchases">
          <PurchasesTab
            purchases={purchases}
            canCreate={canCreate}
            canEdit={canEdit}
            canPartition={canPartition}
            onNew={() => { setEditing(null); setFormOpen(true); }}
            onQuickView={setQuickView}
            onEdit={(p) => { setEditing(p); setFormOpen(true); }}
            onSubdivide={handleSubdividePurchase}
          />
        </TabsContent>

        <TabsContent value="parcels">
          <ParcelsTab
            parcels={parcels}
            canPartition={canPartition}
            canSell={canSell}
            purchaseFilter={purchaseFilter}
            onClearFilter={() => setPurchaseFilter(null)}
            onPartition={setPartitionParcel}
            onCanvasPartition={setCanvasParcel}
            onValuate={setValuateParcel}
            onSell={setSellParcel}
          />
        </TabsContent>
      </Tabs>

      <LandDetailDrawer purchase={quickView} onClose={() => setQuickView(null)} />

      <LandPurchaseFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        projects={projects}
        editing={editing}
        onCreated={(newPurchaseId: string) => {
          // After a new purchase is created, find its root parcel and prompt to subdivide.
          if (canPartition) {
            // Defer to allow the server data to refresh.
            setTimeout(() => {
              const root = rootParcelForPurchase(newPurchaseId);
              if (root) setSubdividePrompt(root);
            }, 500);
          }
        }}
      />
      <PartitionDialog
        open={partitionParcel != null}
        onOpenChange={(o) => !o && setPartitionParcel(null)}
        parcel={partitionParcel}
      />
      <PartitionCanvasDialog
        open={canvasParcel != null}
        onOpenChange={(o) => !o && setCanvasParcel(null)}
        parcel={canvasParcel}
      />
      <ParcelValuationDialog
        open={valuateParcel != null}
        onOpenChange={(o) => !o && setValuateParcel(null)}
        parcel={valuateParcel}
      />
      {canSell && sellParcel && (
        <SellAssetDialog
          open={sellParcel != null}
          onOpenChange={(o) => { if (!o) setSellParcel(null); }}
          customers={customers ?? []}
          presetAsset={toSellableAsset(sellParcel)}
          onSold={(assetId) => {
            // The sellAsset service already marks the parcel SOLD.
            // A full refresh will update the local state; just close the dialog.
            setSellParcel(null);
          }}
        />
      )}

      {/* Post-creation prompt: subdivide now or keep as whole */}
      {subdividePrompt && (
        <Dialog
          open={subdividePrompt != null}
          onOpenChange={(o) => { if (!o) setSubdividePrompt(null); }}
          title="Subdivide this land?"
          description={`The purchase created parcel "${subdividePrompt.number}" covering ${formatNumber(subdividePrompt.area, 0)} ${subdividePrompt.areaUnit}. You can subdivide it into smaller sellable plots now, or keep it as a single whole plot and sell it as-is.`}
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
                <SplitSquareHorizontal className="mx-auto h-5 w-5 text-brand" />
                <div className="mt-1.5 text-body font-medium">Subdivide</div>
                <div className="mt-0.5 text-caption text-muted-foreground">Split into plots for individual sale</div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
                <CircleDollarSign className="mx-auto h-5 w-5 text-muted-foreground" />
                <div className="mt-1.5 text-body font-medium">Keep as whole</div>
                <div className="mt-0.5 text-caption text-muted-foreground">Sell the entire parcel as one</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSubdividePrompt(null)}>
                Keep as whole
              </Button>
              <Button onClick={() => {
                setPartitionParcel(subdividePrompt);
                setSubdividePrompt(null);
              }}>
                <SplitSquareHorizontal className="mr-1 h-3.5 w-3.5" /> Subdivide now
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Purchases tab — list rows with cadastre thumbnails
// ───────────────────────────────────────────────────────────

function PurchasesTab({
  purchases,
  canCreate,
  canEdit,
  canPartition,
  onNew,
  onQuickView,
  onEdit,
  onSubdivide,
}: {
  purchases: LandPurchaseRowType[];
  canCreate: boolean;
  canEdit: boolean;
  canPartition: boolean;
  onNew: () => void;
  onQuickView: (p: LandPurchaseRowType) => void;
  onEdit: (p: LandPurchaseRowType) => void;
  onSubdivide: (purchaseId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => purchases.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.sellerName.toLowerCase().includes(q) && !(p.projectName ?? "").toLowerCase().includes(q) && !(p.location ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    if (status === "available" && p.availableCount === 0) return false;
    if (status === "sold" && p.soldCount === 0) return false;
    if (status === "subdivided" && !p.hasChildren) return false;
    if (status === "whole" && p.hasChildren) return false;
    return true;
  }), [purchases, search, status]);

  // Split into two sections: whole plots (not subdivided) and subdivided land.
  const wholePlots = filtered.filter((p) => !p.hasChildren);
  const subdivided = filtered.filter((p) => p.hasChildren);

  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={<LandPlot className="h-5 w-5" />}
        title="No land purchases yet"
        description="Record your first land purchase to start tracking land inventory. A purchase creates an initial parcel covering the full area, which you can partition into sellable sub-plots."
        action={
          canCreate ? (
            <Button size="sm" onClick={onNew}>
              <Plus className="h-4 w-4" /> New Purchase
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search seller, project, location…"
            className="pl-8"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-[160px]">
          <option value="">All purchases</option>
          <option value="whole">Whole plots only</option>
          <option value="subdivided">Subdivided only</option>
          <option value="available">Has available</option>
          <option value="sold">Has sold</option>
        </Select>
        {(search || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatus(""); }} className="text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<LandPlot className="h-5 w-5" />}
          title="No purchases match the filters"
          description="Try adjusting your search or filters."
        />
      ) : (
        <>
          {/* Whole Plots section — land that hasn't been subdivided, sold as a single parcel */}
          {wholePlots.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-body font-medium text-foreground">Whole Plots</h3>
                <span className="text-caption text-muted-foreground tnum">({wholePlots.length})</span>
                <span className="text-caption text-muted-foreground">— sold as a single parcel</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <DataTable
                  data={wholePlots}
                  columns={landColumnsWithActions(canEdit, canPartition, onEdit, onSubdivide)}
                  getRowId={(p) => p.id}
                  onRowClick={onQuickView}
                  hideable
                  pageSize={50}
                />
              </div>
            </div>
          )}

          {/* Subdivided Land section — land that has been split into sub-plots */}
          {subdivided.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <SplitSquareHorizontal className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-body font-medium text-foreground">Subdivided Land</h3>
                <span className="text-caption text-muted-foreground tnum">({subdivided.length})</span>
                <span className="text-caption text-muted-foreground">— split into sellable sub-plots</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <DataTable
                  data={subdivided}
                  columns={landColumnsWithActions(canEdit, canPartition, onEdit, onSubdivide)}
                  getRowId={(p) => p.id}
                  onRowClick={onQuickView}
                  hideable
                  pageSize={50}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Parcels tab — hierarchical tree with filters
// ───────────────────────────────────────────────────────────

function ParcelsTab({
  parcels,
  canPartition,
  canSell,
  purchaseFilter,
  onClearFilter,
  onPartition,
  onCanvasPartition,
  onValuate,
  onSell,
}: {
  parcels: LandParcelRow[];
  canPartition: boolean;
  canSell: boolean;
  purchaseFilter: string | null;
  onClearFilter: () => void;
  onPartition: (p: LandParcelRow) => void;
  onCanvasPartition: (p: LandParcelRow) => void;
  onValuate: (p: LandParcelRow) => void;
  onSell: (p: LandParcelRow) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState(""); // "" = all, "whole" = root parcels only, "subdivided" = child parcels only
  const [search, setSearch] = useState("");
  const [delParcel, setDelParcel] = useState<LandParcelRow | null>(null);

  const filtered = useMemo(() => {
    let scope = parcels;
    if (purchaseFilter) {
      const inTree = new Set<string>();
      const addDescendants = (id: string) => {
        parcels.filter((p) => p.parentParcelId === id).forEach((c) => {
          inTree.add(c.id);
          addDescendants(c.id);
        });
      };
      parcels.filter((p) => p.landPurchaseId === purchaseFilter).forEach((p) => {
        inTree.add(p.id);
        addDescendants(p.id);
      });
      scope = parcels.filter((p) => inTree.has(p.id));
    }
    return scope.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (viewMode === "whole" && p.parentParcelId !== null) return false;
      if (viewMode === "subdivided" && p.parentParcelId === null) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.number.toLowerCase().includes(q) && !(p.projectName ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [parcels, purchaseFilter, statusFilter, viewMode, search]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parcel number, project…"
            className="pl-8"
          />
        </div>
        <Select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="sm:max-w-[160px]">
          <option value="">All parcels</option>
          <option value="whole">Whole plots only</option>
          <option value="subdivided">Sub-plots only</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[160px]">
          <option value="">All statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="HOLD">Hold</option>
          <option value="PARTITIONED">Partitioned</option>
          <option value="SOLD">Sold</option>
        </Select>
        {(statusFilter || viewMode || search || purchaseFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(""); setViewMode(""); setSearch(""); onClearFilter(); }} className="text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {purchaseFilter && (
        <div className="inline-flex items-center gap-2 text-caption">
          <span className="text-muted-foreground">Filtered to one purchase&apos;s tree</span>
          <button type="button" className="text-muted-foreground transition-colors hover:text-foreground" onClick={onClearFilter} title="Clear filter">
            ✕
          </button>
        </div>
      )}

      {/* Count (only when filtered — otherwise the tree is self-evident) + legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {(statusFilter || viewMode || search || purchaseFilter) && (
          <span className="text-caption text-muted-foreground tnum">
            {filtered.length} of {parcels.length} parcels
          </span>
        )}
        <CadastreLegend />
      </div>

      <ParcelsTree
        parcels={filtered}
        canPartition={canPartition}
        canSell={canSell}
        onPartition={onPartition}
        onCanvasPartition={onCanvasPartition}
        onValuate={onValuate}
        onSell={onSell}
        onDelete={canPartition ? setDelParcel : undefined}
      />

      {delParcel && (
        <DeleteConfirmDialog
          open={delParcel !== null}
          onOpenChange={(o) => { if (!o) setDelParcel(null); }}
          endpoint={`/api/land-parcels/${delParcel.id}`}
          title="Delete land parcel"
          description={`Delete parcel "${delParcel.number}"? Only available or held parcels without children or sales can be deleted.`}
          successMessage="Parcel deleted"
          onSuccess={() => { setDelParcel(null); }}
        />
      )}
    </div>
  );
}
