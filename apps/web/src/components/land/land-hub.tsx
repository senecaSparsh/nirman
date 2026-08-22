"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, Trash2, FileText, Layers, DollarSign,
  Calendar, MapPinned, ScrollText, ExternalLink, Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { SellAssetDialog } from "@/components/sales/sell-asset-dialog";
import { StatusPill } from "@/components/page";
import { LandPurchaseFormDialog, type LandPurchaseEditInitial } from "./land-purchase-form-dialog";
import { PartitionDialog } from "./partition-dialog";
import { PartitionCanvasDialog } from "./partition-canvas-dialog";
import { ParcelValuationDialog } from "./parcel-valuation-dialog";
import { ParcelsTree } from "./parcels-tree";
import { LegalDocsSection, type LegalDocRow } from "@/components/legal/legal-docs-section";
import { CadastrePlan, CadastreLegend } from "./cadastre-plan";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import type { LandParcelRow, LandParcelSummary, LandPurchaseRow, ProjectOption, SellableAssetRow } from "@/lib/types";
import { useTabParam } from "@/lib/use-tab-param";
import { useTrackRecent } from "@/lib/use-recently-viewed";

export type LandHubData = {
  purchase: {
    id: string;
    sellerName: string;
    sellerContact: string | null;
    purchaseDate: string;
    totalArea: number;
    areaUnit: string;
    totalCost: number;
    registryNo: string | null;
    location: string | null;
    documentUrl: string | null;
    projectId: string | null;
    projectName: string | null;
    mode?: "WHOLE" | "SUBDIVIDED" | null;
    // Land type & lease
    landType?: "FREEHOLD" | "LEASEHOLD" | null;
    leaseType?: "ONE_TIME" | "YEARLY" | null;
    leasePeriodYears?: number | null;
    leaseStartDate?: string | null;
    leaseEndDate?: string | null;
    // Cost breakup
    baseCost?: number;
    leaseRentPercent?: number | null;
    leaseRentAmount?: number | null;
    gstPercent?: number | null;
    gstAmount?: number | null;
    registrationPercent?: number | null;
    registrationAmount?: number | null;
    stampDutyPercent?: number | null;
    stampDutyAmount?: number | null;
    brokerageAmount?: number | null;
    legalFees?: number | null;
    otherCharges?: number | null;
  };
  parcels: LandParcelRow[];
  parcelSummaries: LandParcelSummary[];
  sales: {
    id: string;
    saleNumber: string;
    salePrice: number;
    profit: number;
    saleDate: string;
    paymentStatus: string;
    parcelNumber: string;
    customerName: string;
  }[];
  stats: {
    parcelCount: number;
    availableCount: number;
    holdCount: number;
    soldCount: number;
    partitionedCount: number;
    availableArea: number;
    unsoldValue: number;
    costBasis: number;
    valuationGain: number;
    soldRevenue: number;
    soldProfit: number;
  };
  permissions: { canEdit: boolean; canDelete: boolean; canPartition: boolean; canSell: boolean; canManageLegal: boolean };
  customers: { id: string; name: string }[];
  projectOptions: ProjectOption[];
  // Built units linked to parcels (subdivided inventory)
  parcelBuiltUnits?: ParcelBuiltUnitRow[];
  // Legal documents (permissions, licenses, NOCs, certificates, ATS)
  legalDocs?: LegalDocRow[];
};

export type ParcelBuiltUnitRow = {
  id: string;
  unitNumber: string;
  unitType: string;
  status: string;
  area: number;
  areaUnit: string;
  floor: number | null;
  wing: string | null;
  originType: string;
  acquisitionCost: number;
  productionCost: number;
  askingPrice: number | null;
  currentValuation: number;
  landParcelId: string;
  projectId: string;
  projectName: string;
};

const PAYMENT_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  PARTIAL: "warning",
  PAID: "success",
  CANCELLED: "danger",
};

export function LandHub({ data }: { data: LandHubData }) {
  const { purchase, parcels, parcelSummaries, stats, permissions, customers, parcelBuiltUnits } = data;
  const hasBuiltUnits = parcelBuiltUnits && parcelBuiltUnits.length > 0;
  const [tab, setTab] = useTabParam(
    hasBuiltUnits ? (["parcels","units","sales","legal"] as const) : (["parcels","sales","legal"] as const),
    "parcels",
  );
  const trackRecent = useTrackRecent();

  useEffect(() => {
    trackRecent({ type: "land", id: purchase.id, label: `Land from ${purchase.sellerName}`, href: `/land/${purchase.id}` });
  }, [purchase.id, purchase.sellerName, trackRecent]);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [canvasParcel, setCanvasParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);
  const [sellParcel, setSellParcel] = useState<LandParcelRow | null>(null);
  const [deleteParcel, setDeleteParcel] = useState<LandParcelRow | null>(null);
  const [unpartitionParcel, setUnpartitionParcel] = useState<LandParcelRow | null>(null);
  const router = useRouter();

  async function handleUnpartition(p: LandParcelRow) {
    if (!confirm(`Un-divide this parcel? This will remove all ${p.childCount} sub-parcels and restore "${p.number}" to Available.`)) return;
    try {
      const res = await fetch("/api/land-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpartition", parentParcelId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unpartition failed");
      toast.success("Parcel un-divided — original plot restored");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to un-divide");
    }
  }

  function toSellableAsset(p: LandParcelRow): SellableAssetRow {
    return {
      assetType: "LAND",
      assetId: p.id,
      label: `Plot ${p.number} — ${formatNumber(p.area, 0)} ${p.areaUnit}`,
      projectId: p.projectId,
      projectName: p.projectName,
      projectReraNumber: null,
      costBasis: p.acquisitionCost,
      askingPrice: p.askingPrice,
      currentValuation: p.currentValuation,
    };
  }

  const gainPositive = stats.valuationGain >= 0;
  const profitPositive = stats.soldProfit >= 0;
  const costPerUnit = purchase.totalArea > 0 ? purchase.totalCost / purchase.totalArea : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/land"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Land</Link>
        </Button>
      </div>

      {/* Registry record header — a surveyor's field sheet, not a generic title block.
          Land is an immovable spatial asset; the header reads like a title deed:
          accent strip + document ref + structured field grid + grouped KPIs. */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-card">
        {/* Survey grid — faint, fades downward, ties the card to the survey domain */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundColor: "var(--color-card)",
            backgroundImage:
              "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 22%, transparent 70%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 22%, transparent 70%)",
          }}
        />
        {/* Left accent strip — land is a sell-stage asset */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: "var(--color-stage-sell)" }}
        />

        <div className="relative pl-5 pr-4 py-4">
          {/* Document header — eyebrow + registry reference, like a deed's top line */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-label text-muted-foreground/80">Land Purchase</span>
            <span className="flex items-center gap-1.5 font-mono text-caption text-muted-foreground tnum">
              <ScrollText className="h-3 w-3" />
              {purchase.registryNo ? `REGISTRY № ${purchase.registryNo}` : "REGISTRY —"}
            </span>
          </div>

          {/* Title row — seller is the principal party; project is the linked build */}
          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-title text-foreground">{purchase.sellerName}</h1>
              <div className="mt-1.5 flex items-center gap-2">
                {purchase.projectName ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-caption text-muted-foreground">
                    <Layers className="h-3 w-3" />
                    {purchase.projectName}
                  </span>
                ) : (
                  <span className="text-caption text-muted-foreground/70">Standalone land</span>
                )}
                {purchase.mode && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-caption text-muted-foreground">
                    {purchase.mode === "WHOLE" ? "Whole Plot" : "Sub-divided"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {permissions.canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              )}
              {permissions.canDelete && (
                <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="text-muted-foreground hover:text-danger">
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Archive
                </Button>
              )}
            </div>
          </div>

          {/* Field grid — structured key/value columns like a property record sheet */}
          <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border/70 pt-3">
            <FieldItem
              icon={<MapPinned className="h-3 w-3" />}
              label="Location"
              value={purchase.location ?? "—"}
            />
            <FieldItem
              icon={<Calendar className="h-3 w-3" />}
              label="Purchase Date"
              value={formatDate(purchase.purchaseDate)}
              mono
            />
            <FieldItem
              icon={<FileText className="h-3 w-3" />}
              label="Document"
              value={purchase.documentUrl ? "View" : "—"}
              href={purchase.documentUrl ?? undefined}
            />
          </div>

          {/* Land type + lease info */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-0.5 text-caption font-medium bg-brand/10 text-brand">
              {purchase.landType === "LEASEHOLD" ? "Leasehold" : "Freehold"}
            </span>
            {purchase.landType === "LEASEHOLD" && purchase.leaseType && (
              <span className="rounded-full px-2.5 py-0.5 text-caption font-medium bg-muted text-muted-foreground">
                {purchase.leaseType === "ONE_TIME" ? "One-time lease rent" : "Yearly lease rent"}
                {purchase.leasePeriodYears ? ` · ${purchase.leasePeriodYears} yrs` : ""}
              </span>
            )}
            {purchase.mode === "SUBDIVIDED" && (
              <span className="rounded-full px-2.5 py-0.5 text-caption font-medium bg-steel/10 text-steel">
                Sub-divided into {parcels.filter((p) => p.parentParcelId).length} plots
              </span>
            )}
          </div>

          {/* Cost breakup — only show if any breakup fields are present */}
          {purchase.baseCost != null && purchase.baseCost > 0 && (
            <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <div className="text-caption font-semibold text-muted-foreground mb-1">Cost Breakup</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-caption">
                <div className="flex justify-between"><span className="text-muted-foreground">Base Cost:</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.baseCost)}</strong></div>
                {purchase.leaseRentAmount != null && purchase.leaseRentAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Lease Rent ({purchase.leaseRentPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.leaseRentAmount)}</strong></div>
                )}
                {purchase.gstAmount != null && purchase.gstAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">GST ({purchase.gstPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.gstAmount)}</strong></div>
                )}
                {purchase.registrationAmount != null && purchase.registrationAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Registration ({purchase.registrationPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.registrationAmount)}</strong></div>
                )}
                {purchase.stampDutyAmount != null && purchase.stampDutyAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Stamp Duty ({purchase.stampDutyPercent}%):</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.stampDutyAmount)}</strong></div>
                )}
                {purchase.brokerageAmount != null && purchase.brokerageAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Brokerage:</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.brokerageAmount)}</strong></div>
                )}
                {purchase.legalFees != null && purchase.legalFees > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Legal Fees:</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.legalFees)}</strong></div>
                )}
                {purchase.otherCharges != null && purchase.otherCharges > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Other Charges:</span> <strong className="text-foreground tabular-nums">{formatCurrency(purchase.otherCharges)}</strong></div>
                )}
              </div>
              <div className="flex justify-between border-t border-border pt-1 text-body font-semibold">
                <span>Total Land Cost</span>
                <strong className="tabular-nums">{formatCurrency(purchase.totalCost)}</strong>
              </div>
            </div>
          )}

          {/* Sub-divided notice — shows when land was purchased as SUBDIVIDED
              OR when a whole-plot purchase was later partitioned into sub-parcels */}
          {(() => {
            const childParcels = parcels.filter((p) => p.parentParcelId);
            const hasPartitionedParent = parcels.some((p) => p.status === "PARTITIONED" || p.childCount > 0);
            if (purchase.mode === "SUBDIVIDED" || (childParcels.length > 0 && hasPartitionedParent)) {
              const plotNumbers = childParcels.map((p) => p.number).join(", ");
              return (
                <div className="mt-3 rounded-md border border-steel/40 bg-steel/10 px-3 py-2.5 text-caption text-steel">
                  <Layers className="inline mr-1 h-3.5 w-3.5" />
                  <strong>This land has been sub-divided.</strong> The original whole land no longer exists as a single entity — it has been converted into {childParcels.length} separate plots:{" "}
                  <strong>{plotNumbers}</strong>. Each plot is now an independent parcel with its own identity, status, and valuation.
                </div>
              );
            }
            return null;
          })()}

          {/* KPI row — single clean band of stats */}
          <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-border/70 pt-3 sm:grid-cols-6">
            <KpiItem label="Area" value={`${formatNumber(purchase.totalArea, 0)} ${purchase.areaUnit}`} />
            <KpiItem label="Cost" value={formatCurrency(purchase.totalCost)} sub={`${formatCurrency(costPerUnit)}/${purchase.areaUnit}`} />
            <KpiItem label="Available" value={String(stats.availableCount)} />
            <KpiItem label="Unsold" value={formatCurrency(stats.unsoldValue)} />
            <KpiItem
              label="Unrealized"
              value={`${gainPositive ? "+" : ""}${formatCurrency(stats.valuationGain)}`}
              tone={gainPositive ? "positive" : "negative"}
            />
            <KpiItem
              label="Realized"
              value={`${profitPositive ? "+" : ""}${formatCurrency(stats.soldProfit)}`}
              sub={stats.soldCount > 0 ? `${stats.soldCount} sold` : undefined}
              tone={profitPositive ? "positive" : "negative"}
            />
          </div>
        </div>
      </div>

      {/* Split layout: cadastre plan (sticky left) + tabs (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left: Cadastre plan — sticky, the map IS the header */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label text-muted-foreground/70">Cadastre Plan</span>
            <CadastreLegend />
          </div>
          <div className="rounded-lg border border-border bg-card p-2">
            <CadastrePlan parcels={parcelSummaries} height={65} />
          </div>
        </div>

        {/* Right: Tabs — parcels tree + sales */}
        <div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="parcels">
                <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Parcels <CountBadge n={stats.parcelCount} /></span>
              </TabsTrigger>
              {hasBuiltUnits && (
                <TabsTrigger value="units">
                  <span className="flex items-center gap-1.5"><Home className="h-3.5 w-3.5" /> Built Units <CountBadge n={parcelBuiltUnits!.length} /></span>
                </TabsTrigger>
              )}
              <TabsTrigger value="sales">
                <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Sales <CountBadge n={data.sales.length} /></span>
              </TabsTrigger>
              <TabsTrigger value="legal">
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Legal <CountBadge n={data.legalDocs?.length ?? 0} /></span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="parcels">
              <ParcelsTree
                parcels={parcels}
                canPartition={permissions.canPartition}
                canSell={permissions.canSell}
                onPartition={setPartitionParcel}
                onCanvasPartition={setCanvasParcel}
                onValuate={setValuateParcel}
                onSell={setSellParcel}
                onDelete={permissions.canDelete ? setDeleteParcel : undefined}
                onUnpartition={permissions.canPartition ? handleUnpartition : undefined}
              />
            </TabsContent>

            {hasBuiltUnits && (
              <TabsContent value="units">
                <div className="rounded-md border border-border">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Unit</TH>
                        <TH>Type</TH>
                        <TH>Parcel</TH>
                        <TH>Status</TH>
                        <TH>Origin</TH>
                        <TH className="text-right">Area</TH>
                        <TH className="text-right">Cost</TH>
                        <TH className="text-right">Asking</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {parcelBuiltUnits!.map((u) => {
                        const parcel = parcels.find((p) => p.id === u.landParcelId);
                        return (
                          <TR key={u.id}>
                            <TD className="font-medium">{u.unitNumber}</TD>
                            <TD className="text-muted-foreground">{u.unitType.replace("_", " ")}</TD>
                            <TD className="font-mono text-caption">{parcel?.number ?? "—"}</TD>
                            <TD><StatusPill status={u.status} /></TD>
                            <TD>
                              {u.originType === "PURCHASED" ? (
                                <span className="text-micro px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Purchased</span>
                              ) : (
                                <span className="text-micro text-muted-foreground">Created</span>
                              )}
                            </TD>
                            <TD className="tnum text-right">{formatNumber(u.area, 0)} {u.areaUnit}</TD>
                            <TD className="tnum text-right">{formatCurrency(u.originType === "PURCHASED" ? u.acquisitionCost : u.productionCost)}</TD>
                            <TD className="tnum text-right">{u.askingPrice ? formatCurrency(u.askingPrice) : "—"}</TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              </TabsContent>
            )}

            <TabsContent value="sales">
              {data.sales.length === 0 ? (
                <EmptyState
                  icon={<DollarSign className="h-5 w-5" />}
                  title="No land sales yet"
                  description="Sold parcels will appear here with revenue, profit, and payment status."
                />
              ) : (
                <div className="rounded-md border border-border">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Sale</TH>
                        <TH>Parcel</TH>
                        <TH>Customer</TH>
                        <TH className="text-right">Price</TH>
                        <TH className="text-right">Profit</TH>
                        <TH>Payment</TH>
                        <TH>Date</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.sales.map((s) => (
                        <TR key={s.id}>
                          <TD className="font-mono text-caption font-medium">{s.saleNumber}</TD>
                          <TD className="font-mono text-caption">{s.parcelNumber}</TD>
                          <TD>{s.customerName}</TD>
                          <TD className="tnum text-right font-medium">{formatCurrency(s.salePrice)}</TD>
                          <TD className={`tnum text-right ${s.profit >= 0 ? "text-success" : "text-danger"}`}>
                            {s.profit >= 0 ? "+" : ""}{formatCurrency(s.profit)}
                          </TD>
                          <TD><StatusPill status={s.paymentStatus} /></TD>
                          <TD className="text-muted-foreground tnum">{formatDate(s.saleDate)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="legal">
              <LegalDocsSection
                docs={data.legalDocs ?? []}
                landPurchaseId={purchase.id}
                canManage={permissions.canManageLegal}
                context="LAND"
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <LandPurchaseFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projects={data.projectOptions}
        editing={{
          id: purchase.id,
          projectId: purchase.projectId,
          sellerName: purchase.sellerName,
          sellerContact: purchase.sellerContact,
          purchaseDate: purchase.purchaseDate,
          totalArea: purchase.totalArea,
          areaUnit: purchase.areaUnit as LandPurchaseRow["areaUnit"],
          totalCost: purchase.totalCost,
          registryNo: purchase.registryNo,
          location: purchase.location,
          documentUrl: purchase.documentUrl,
        } as LandPurchaseEditInitial}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        endpoint={`/api/land-purchases/${purchase.id}`}
        title="Archive land purchase?"
        description={`${purchase.sellerName} will be archived. All parcels under this purchase will also be archived.`}
        successMessage="Land purchase archived"
        redirectTo="/land"
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
        siblings={valuateParcel ? parcels.filter((p) => p.parentParcelId === valuateParcel.parentParcelId && p.parentParcelId !== null) : undefined}
        parentArea={valuateParcel?.parentParcelId ? parcels.find((p) => p.id === valuateParcel.parentParcelId)?.area ?? null : null}
      />
      {permissions.canSell && sellParcel && (
        <SellAssetDialog
          open={sellParcel != null}
          onOpenChange={(o) => { if (!o) setSellParcel(null); }}
          customers={customers}
          presetAsset={toSellableAsset(sellParcel)}
          onSold={() => setSellParcel(null)}
        />
      )}
      <DeleteConfirmDialog
        open={deleteParcel != null}
        onOpenChange={(o) => { if (!o) setDeleteParcel(null); }}
        endpoint={deleteParcel ? `/api/land-parcels/${deleteParcel.id}` : ""}
        title="Delete parcel?"
        description={deleteParcel ? `Parcel ${deleteParcel.number} will be deleted. This is only possible for AVAILABLE or HOLD parcels with no sales.` : ""}
        successMessage="Parcel deleted"
      />
    </div>
  );
}

/** A labeled field in the registry record's field grid — label above value, like a deed field. */
function FieldItem({
  icon, label, value, mono, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="min-w-0 text-center">
      <div className="flex items-center justify-center gap-1 text-label leading-none text-muted-foreground/60">
        {icon}
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-body font-medium leading-none text-foreground underline underline-offset-2 hover:text-muted-foreground"
        >
          {value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <div className={`mt-1.5 truncate text-body leading-none text-foreground ${mono ? "font-mono tnum" : "font-medium"}`}>
          {value}
        </div>
      )}
    </div>
  );
}

/** A KPI in the stats band. */
function KpiItem({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="min-w-0 text-center">
      <div className="text-label leading-none text-muted-foreground/60">{label}</div>
      <div className={`mt-1.5 tnum text-body font-semibold leading-none ${tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-micro leading-none text-muted-foreground tnum">{sub}</div>}
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="ml-0.5 rounded bg-muted px-1.5 text-micro font-medium text-muted-foreground tnum">
      {n}
    </span>
  );
}
