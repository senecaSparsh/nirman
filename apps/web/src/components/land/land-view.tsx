"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, LandPlot, Layers, SplitSquareHorizontal, CircleDollarSign, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { SellAssetDialog } from "@/components/sales/sell-asset-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill, statusColor } from "@/components/page";
import { LandPurchaseFormDialog } from "./land-purchase-form-dialog";
import { PartitionDialog } from "./partition-dialog";
import { PartitionCanvasDialog } from "./partition-canvas-dialog";
import { ParcelValuationDialog } from "./parcel-valuation-dialog";
import { LandDetailDrawer } from "./land-detail-drawer";
import { CadastrePlan } from "./cadastre-plan";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type {
  LandPurchaseRow as LandPurchaseRowType, LandParcelRow, LandParcelStatus, ProjectOption, SellableAssetRow,
} from "@/lib/types";

/** Base column definitions for the land purchases DataTable. */
const landPurchaseColumns: Column<LandPurchaseRowType>[] = [
  {
    key: "plan",
    label: "Plan",
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
  hidePlanColumn = false,
  compactActions = false,
): Column<LandPurchaseRowType>[] {
  const baseCols = hidePlanColumn
    ? landPurchaseColumns.filter((c) => c.key !== "plan")
    : landPurchaseColumns;
  return [
    ...baseCols,
    {
      key: "actions",
      label: "",
      align: "right",
      render: (p) => {
        const isPartitioned = p.partitionedCount > 0 || p.hasChildren;
        const canShowSubdivide = canPartition && !isPartitioned && p.availableCount > 0;
        if (compactActions) {
          return (
            <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/land/${p.id}`}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          );
        }
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
  projects,
  customers,
  permissions,
  hidePlanColumn = false,
  compactActions = false,
  mobileToggle = false,
}: {
  purchases: LandPurchaseRowType[];
  parcels: LandParcelRow[];
  projects: ProjectOption[];
  customers?: { id: string; name: string }[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canPartition?: boolean; canSell?: boolean };
  hidePlanColumn?: boolean;
  compactActions?: boolean;
  mobileToggle?: boolean;
}) {
  const canCreate = permissions?.canCreate ?? false;
  const canEdit = permissions?.canEdit ?? false;
  const canPartition = permissions?.canPartition ?? false;
  const canSell = permissions?.canSell ?? false;

  const router = useRouter();
  const [quickView, setQuickView] = useState<LandPurchaseRowType | null>(null);

  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [canvasParcel, setCanvasParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);
  const [sellParcel, setSellParcel] = useState<LandParcelRow | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LandPurchaseRowType | null>(null);
  // Track whether the form was opened from the "Add sub-divided purchase" button.
  // If so, after saving we skip the "Subdivide this land?" prompt and go straight
  // to the Partition dialog.
  const [forceSubdivide, setForceSubdivide] = useState(false);

  // Post-creation prompt: after recording a new purchase, ask the user whether
  // to subdivide immediately or keep it as a single whole plot.
  const [subdividePrompt, setSubdividePrompt] = useState<LandParcelRow | null>(null);

  // Mobile toggle: switch between Whole and Sub-Divided tables.
  const [mobileTab, setMobileTab] = useState<"whole" | "sub">("whole");

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

  // Split purchases into whole (not subdivided) and subdivided
  const wholePurchases = purchases.filter((p) => !p.hasChildren);
  const subdividedPurchases = purchases.filter((p) => p.hasChildren);

  return (
    <div className="space-y-6">
      {purchases.length === 0 ? (
        <EmptyState
          icon={<LandPlot className="h-5 w-5" />}
          title="No land yet"
          description="Record your first land purchase to start tracking land inventory. A purchase creates an initial parcel covering the full area, which you can partition into sellable sub-plots."
          action={canCreate ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> New Purchase
            </Button>
          ) : undefined}
        />
      ) : mobileToggle ? (
        <div className="flex flex-col gap-3">
          {/* ── Segmented toggle ── */}
          <div className="mt-6 flex rounded-lg border border-border bg-subtle p-0.5">
            <button
              onClick={() => setMobileTab("whole")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-body font-medium transition-colors ${
                mobileTab === "whole"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <CircleDollarSign className="h-3.5 w-3.5" />
              Whole
              <span className="text-caption tnum text-muted-foreground">({wholePurchases.length})</span>
            </button>
            <button
              onClick={() => setMobileTab("sub")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-body font-medium transition-colors ${
                mobileTab === "sub"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              Sub-Divided
              <span className="text-caption tnum text-muted-foreground">({subdividedPurchases.length})</span>
            </button>
          </div>

          {/* ── Active table ── */}
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-raised">
            {mobileTab === "whole" ? (
              <DataTable
                className="h-full"
                data={wholePurchases}
                columns={landColumnsWithActions(canEdit, canPartition, (p) => { setEditing(p); setFormOpen(true); }, handleSubdividePurchase, hidePlanColumn, compactActions)}
                getRowId={(p) => p.id}
                onRowClick={setQuickView}
                hideable
                pageSize={50}
                onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); setForceSubdivide(false); } : undefined}
                addRowLabel="Add land purchase"
              />
            ) : (
              <DataTable
                className="h-full"
                data={subdividedPurchases}
                columns={landColumnsWithActions(canEdit, canPartition, (p) => { setEditing(p); setFormOpen(true); }, handleSubdividePurchase, hidePlanColumn, compactActions)}
                getRowId={(p) => p.id}
                onRowClick={setQuickView}
                hideable
                pageSize={50}
                onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); setForceSubdivide(true); } : undefined}
                addRowLabel="Add sub-divided purchase"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          {/* ── Whole / Non-Divided ── */}
          <div className="flex flex-col gap-3">
            <div className="flex h-8 items-center gap-2">
              <CircleDollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="shrink-0 text-body font-medium text-foreground">Whole / Non-Divided</h3>
              <span className="shrink-0 text-caption text-muted-foreground tnum">({wholePurchases.length})</span>
              <span className="truncate text-caption text-muted-foreground">— single parcel, sell as-is</span>
            </div>
            <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                className="h-full"
                data={wholePurchases}
                columns={landColumnsWithActions(canEdit, canPartition, (p) => { setEditing(p); setFormOpen(true); }, handleSubdividePurchase, hidePlanColumn, compactActions)}
                getRowId={(p) => p.id}
                onRowClick={setQuickView}
                hideable
                pageSize={50}
                onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); setForceSubdivide(false); } : undefined}
                addRowLabel="Add land purchase"
              />
            </div>
          </div>

          {/* ── Sub-Divided ── */}
          <div className="flex flex-col gap-3">
            <div className="flex h-8 items-center gap-2">
              <SplitSquareHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="shrink-0 text-body font-medium text-foreground">Sub-Divided</h3>
              <span className="shrink-0 text-caption text-muted-foreground tnum">({subdividedPurchases.length})</span>
              <span className="truncate text-caption text-muted-foreground">— split into sellable plots</span>
            </div>
            <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                className="h-full"
                data={subdividedPurchases}
                columns={landColumnsWithActions(canEdit, canPartition, (p) => { setEditing(p); setFormOpen(true); }, handleSubdividePurchase, hidePlanColumn, compactActions)}
                getRowId={(p) => p.id}
                onRowClick={setQuickView}
                hideable
                pageSize={50}
                onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); setForceSubdivide(true); } : undefined}
                addRowLabel="Add sub-divided purchase"
              />
            </div>
          </div>
        </div>
      )}

      <LandDetailDrawer purchase={quickView} onClose={() => setQuickView(null)} />

      <LandPurchaseFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) {
            setEditing(null);
            setForceSubdivide(false);
          }
        }}
        projects={projects}
        editing={editing}
        onCreated={(newPurchaseId: string, rootParcel?: { id: string; number: string; area: number; areaUnit: string; acquisitionCost: number }) => {
          // After a new purchase is created, prompt to subdivide using the root parcel
          // info returned from the API (avoids relying on stale server data).
          if (canPartition && rootParcel) {
            const parcelRow: LandParcelRow = {
              id: rootParcel.id,
              landPurchaseId: newPurchaseId,
              parentParcelId: null,
              parentParcelNumber: null,
              number: rootParcel.number,
              area: rootParcel.area,
              areaUnit: rootParcel.areaUnit as LandParcelRow["areaUnit"],
              status: "AVAILABLE",
              acquisitionCost: rootParcel.acquisitionCost,
              askingPrice: null,
              currentValuation: rootParcel.acquisitionCost,
              isInfrastructure: false,
              marketValue: null,
              weightFactor: null,
              projectId: null,
              projectName: null,
              geometry: null,
              childCount: 0,
              salePrice: null,
              saleProfit: null,
              saleNumber: null,
              saleDate: null,
              customerName: null,
            };
            if (forceSubdivide) {
              // From "Add sub-divided purchase" — skip the prompt, go straight
              // to the Partition dialog.
              setPartitionParcel(parcelRow);
              setForceSubdivide(false);
            } else {
              // From "Add land purchase" (whole) — show the "Subdivide now?"
              // prompt so the user can choose to keep it whole or subdivide.
              setSubdividePrompt(parcelRow);
            }
          } else {
            // No partition permission or no root parcel — just refresh so the
            // new purchase shows up in the list.
            router.refresh();
          }
        }}
      />
      <PartitionDialog
        open={partitionParcel != null}
        onOpenChange={(o) => { if (!o) { setPartitionParcel(null); router.refresh(); } }}
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
          onOpenChange={(o) => { if (!o) { setSubdividePrompt(null); router.refresh(); } }}
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
              <Button variant="outline" onClick={() => { setSubdividePrompt(null); router.refresh(); }}>
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
