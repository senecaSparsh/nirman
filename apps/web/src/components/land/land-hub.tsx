"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Pencil, Trash2, FileText, Layers, DollarSign,
  Calendar, MapPinned, ScrollText, ExternalLink, TrendingUp, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { LandPurchaseFormDialog, type LandPurchaseEditInitial } from "./land-purchase-form-dialog";
import { PartitionDialog } from "./partition-dialog";
import { PartitionCanvasDialog } from "./partition-canvas-dialog";
import { ParcelValuationDialog } from "./parcel-valuation-dialog";
import { ParcelsTree } from "./parcels-tree";
import { CadastrePlan, CadastreLegend } from "./cadastre-plan";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import type { LandParcelRow, LandParcelSummary, LandPurchaseRow, ProjectOption } from "@/lib/types";

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
  permissions: { canEdit: boolean; canDelete: boolean; canPartition: boolean };
  projectOptions: ProjectOption[];
};

const PAYMENT_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  PARTIAL: "warning",
  PAID: "success",
  CANCELLED: "danger",
};

export function LandHub({ data }: { data: LandHubData }) {
  const { purchase, parcels, parcelSummaries, stats, permissions } = data;
  const [tab, setTab] = useState("parcels");

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [canvasParcel, setCanvasParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);

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
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/70 pt-3 sm:grid-cols-4">
            <FieldItem
              icon={<MapPinned className="h-3 w-3" />}
              label="Location"
              value={purchase.location ?? "—"}
            />
            <FieldItem
              icon={<ScrollText className="h-3 w-3" />}
              label="Registry No"
              value={purchase.registryNo ?? "—"}
              mono
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

          {/* KPI row — two groups: Holding (what you own) | Performance (how it's doing) */}
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border/70 pt-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            {/* Holding group */}
            <div>
              <div className="text-label text-muted-foreground/60">Holding</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                <KpiItem label="Area" value={`${formatNumber(purchase.totalArea, 0)} ${purchase.areaUnit}`} />
                <KpiItem label="Cost" value={formatCurrency(purchase.totalCost)} sub={`${formatCurrency(costPerUnit)}/${purchase.areaUnit}`} />
                <KpiItem label="Parcels" value={String(stats.parcelCount)} />
              </div>
            </div>

            {/* Vertical separator */}
            <div className="hidden w-px self-stretch bg-border/70 md:block" />

            {/* Performance group */}
            <div className="md:text-right">
              <div className="text-label text-muted-foreground/60">Performance</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 md:justify-end">
                <KpiItem label="Unsold" value={formatCurrency(stats.unsoldValue)} />
                <KpiItem
                  label="Unrealized"
                  value={`${gainPositive ? "+" : ""}${formatCurrency(stats.valuationGain)}`}
                  tone={gainPositive ? "positive" : "negative"}
                  icon={gainPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                />
                <KpiItem
                  label="Sold Profit"
                  value={`${profitPositive ? "+" : ""}${formatCurrency(stats.soldProfit)}`}
                  sub={stats.soldCount > 0 ? `${stats.soldCount} · ${formatCurrency(stats.soldRevenue)}` : undefined}
                  tone={profitPositive ? "positive" : "negative"}
                  icon={profitPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Split layout: cadastre plan (sticky left) + tabs (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Left: Cadastre plan — sticky, the map IS the header */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label text-muted-foreground/70">Cadastre Plan</span>
            <CadastreLegend />
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <CadastrePlan parcels={parcelSummaries} height={80} />
            <div className="mt-2 border-t border-border/60 pt-2 text-caption text-muted-foreground tnum">
              {stats.availableCount} available · {stats.soldCount} sold · {stats.partitionedCount} partitioned
            </div>
          </div>
        </div>

        {/* Right: Tabs — parcels tree + sales */}
        <div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="parcels">
                <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Parcels <CountBadge n={stats.parcelCount} /></span>
              </TabsTrigger>
              <TabsTrigger value="sales">
                <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Sales <CountBadge n={data.sales.length} /></span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="parcels">
              <ParcelsTree
                parcels={parcels}
                canPartition={permissions.canPartition}
                onPartition={setPartitionParcel}
                onCanvasPartition={setCanvasParcel}
                onValuate={setValuateParcel}
              />
            </TabsContent>

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
                          <TD><Badge variant={PAYMENT_VARIANT[s.paymentStatus] ?? "default"}>{s.paymentStatus}</Badge></TD>
                          <TD className="text-muted-foreground tnum">{formatDate(s.saleDate)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
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
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-label text-muted-foreground/60">
        {icon}
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-body font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground"
        >
          {value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <div className={`mt-1 truncate text-body text-foreground ${mono ? "font-mono tnum" : "font-medium"}`}>
          {value}
        </div>
      )}
    </div>
  );
}

/** A KPI in the grouped performance/holding row. */
function KpiItem({
  label, value, sub, tone, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label text-muted-foreground/60">{label}</span>
      <span className="flex items-baseline gap-1">
        {icon && <span className={tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-muted-foreground"}>{icon}</span>}
        <span className={`tnum text-body font-semibold ${tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-foreground"}`}>
          {value}
        </span>
        {sub && <span className="text-micro text-muted-foreground tnum">{sub}</span>}
      </span>
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
