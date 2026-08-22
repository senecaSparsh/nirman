"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin, Calendar, ScrollText, Layers,
  TrendingUp, TrendingDown, CheckCircle2, PauseCircle, Split,
  IndianRupee, Maximize, Trash2, Pencil, X, Search, ChevronRight,
  Plus, Loader2, AlertCircle, Home, DollarSign, Tag,
  Phone, FileText, ExternalLink, Building2, Hammer, Ban, ZoomIn,
} from "lucide-react";
import { MobileLandEditForm } from "./MobileLandEditForm";
import { MobileLegalDocsSection } from "@/components/legal/mobile-legal-docs-section";
import { formatCurrency, formatCurrencyCompact, formatNumber, formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { toast } from "sonner";

/* ─── Types ─── */

interface Parcel {
  id: string;
  number: string;
  status: string;
  purpose?: "SELL" | "PROJECT" | "HOLD" | null;
  area: number;
  areaUnit: string;
  acquisitionCost: number;
  askingPrice: number | null;
  currentValuation: number;
  parentParcelId: string | null;
  parentParcelNumber: string | null;
  isInfrastructure: boolean;
  childCount: number;
  projectId: string | null;
  salePrice: number | null;
  saleProfit: number | null;
  saleNumber: string | null;
  saleDate: string | null;
  saleStage: string | null;
  customerName: string | null;
}

interface Sale {
  id: string;
  saleNumber: string;
  salePrice: number;
  profit: number;
  saleDate: string;
  paymentStatus: string;
  saleStage: string;
  parcelNumber: string;
  customerName: string;
}

interface BuiltUnit {
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
  landParcelNumber: string | null;
  projectName: string;
}

interface LandData {
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
  costPerUnit: number;
  parcels: Parcel[];
  sales: Sale[];
  builtUnits: BuiltUnit[];
  legalDocs?: import("@/components/legal/legal-docs-section").LegalDocRow[];
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
}

interface Customer { id: string; name: string; }

const AREA_UNIT_SHORT: Record<string, string> = {
  SQFT: "sqft", SQM: "sqm", SQYD: "sqyd", ACRE: "acre",
  BIGHA: "bigha", KATHA: "katha", HECTARE: "ha",
};

const STATUS_META: Record<string, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  AVAILABLE: { color: "var(--color-go)", label: "Available", icon: CheckCircle2 },
  HOLD: { color: "var(--color-signal)", label: "Hold", icon: PauseCircle },
  PARTITIONED: { color: "var(--color-steel)", label: "Partitioned", icon: Split },
  SOLD: { color: "var(--color-stop)", label: "Sold", icon: DollarSign },
};

const PURPOSE_META: Record<string, { color: string; label: string; icon: typeof Tag }> = {
  SELL: { color: "var(--color-go)", label: "Sell", icon: DollarSign },
  PROJECT: { color: "var(--color-steel)", label: "Project", icon: Hammer },
  HOLD: { color: "var(--color-signal)", label: "Hold", icon: Ban },
};

const MODE_META: Record<string, { label: string }> = {
  WHOLE: { label: "Whole Plot" },
  SUBDIVIDED: { label: "Sub-divided" },
};

/** Cadastre plan status → mobile color token mapping */
const CADASTRE_FILL: Record<string, string> = {
  AVAILABLE: "var(--color-go)",
  HOLD: "var(--color-signal)",
  PARTITIONED: "var(--color-steel)",
  SOLD: "var(--color-stop)",
  RESERVED: "var(--color-steel)",
  RENTED: "var(--color-steel)",
};

/* ─── Main component ─── */

export function MobileLandDetailClient({
  data,
  canManage,
  canPartition,
  canSell,
  canManageLegal,
  customers,
  notFound,
}: {
  data?: LandData;
  canManage: boolean;
  canPartition: boolean;
  canSell: boolean;
  canManageLegal: boolean;
  customers: Customer[];
  notFound?: boolean;
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [view, setView] = useState<"parcels" | "units">("parcels");
  const [cadastreZoom, setCadastreZoom] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  // Sort parcels: PARTITIONED parents last, then by number
  const sortedParcels = useMemo(() => {
    if (!data) return [];
    return [...data.parcels].sort((a, b) => {
      if (a.status === "PARTITIONED" && b.status !== "PARTITIONED") return 1;
      if (a.status !== "PARTITIONED" && b.status === "PARTITIONED") return -1;
      return a.number.localeCompare(b.number);
    });
  }, [data]);

  const sortedUnits = useMemo(() => {
    if (!data) return [];
    return [...data.builtUnits].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
  }, [data]);

  if (notFound || !data) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Land purchase not found
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <MapPin className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Land purchase not found
          </p>
        </div>
      </div>
    );
  }

  const unitShort = AREA_UNIT_SHORT[data.areaUnit] ?? data.areaUnit.toLowerCase();
  const gainPositive = data.stats.valuationGain >= 0;
  const profitPositive = data.stats.soldProfit >= 0;

  const hasBuiltUnits = data.builtUnits.length > 0;

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {data.location ?? data.sellerName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[0.625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
              from {data.sellerName}
            </p>
            {data.mode ? (
              <span
                className="text-[0.5625rem] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{ color: "var(--color-steel)", backgroundColor: "var(--color-steel-wash)" }}
              >
                {MODE_META[data.mode]?.label ?? data.mode}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Registry record card — cadastre thumb on left, info on right, full-width bottom ── */}
      <div
        className="relative overflow-hidden rounded-[0.625rem] border mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {/* Accent strip — land is a sell-stage asset */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: "var(--color-stage-sell, var(--color-go))" }}
        />

        {/* Top row: cadastre thumb (left) + registry info (right) */}
        <div className="flex items-start">
          {/* Cadastre plan — square thumbnail on the left, like a profile pic */}
          {sortedParcels.length > 0 ? (
            <button
              onClick={() => setCadastreZoom(true)}
              className="shrink-0 border-r flex items-center justify-center press relative"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper-2)",
                width: "7.5rem",
                height: "7.5rem",
              }}
            >
              <div className="w-full h-full p-1.5">
                <MobileCadastrePlan parcels={sortedParcels} />
              </div>
              <ZoomIn className="absolute top-1 right-1 size-3 opacity-50" style={{ color: "var(--color-ink-500)" }} />
            </button>
          ) : null}

          {/* Right side — registry info */}
          <div className="flex-1 min-w-0 pl-3 pr-2.5 py-2">
            {/* Registry no + mode badge */}
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-0.5 text-[0.5rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
                <ScrollText className="size-2.5" />
                {data.registryNo ? `№ ${data.registryNo}` : "—"}
              </span>
              {data.projectName ? (
                <Link
                  href={`/m/projects/${data.projectId}`}
                  className="flex items-center gap-0.5 text-[0.5rem] font-semibold px-1.5 py-0.5 rounded press"
                  style={{ color: "var(--color-steel)", backgroundColor: "var(--color-steel-wash)" }}
                >
                  <Building2 className="size-2.5" />
                  {data.projectName}
                  <ChevronRight className="size-2" />
                </Link>
              ) : (
                <span className="text-[0.5rem] font-semibold px-1.5 py-0.5 rounded" style={{ color: "var(--color-ink-500)", backgroundColor: "var(--color-paper-2)" }}>
                  Standalone
                </span>
              )}
            </div>

            {/* Seller name */}
            <p className="text-[0.6875rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
              {data.sellerName}
            </p>
            {/* Location (left) + phone (right) — same row */}
            <div className="flex items-center justify-between gap-1.5 mt-0.5">
              {data.location ? (
                <p className="text-[0.5rem] flex items-center gap-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                  <MapPin className="size-2.5" />
                  {data.location}
                </p>
              ) : <span />}
              {data.sellerContact ? (
                <a
                  href={`tel:${data.sellerContact}`}
                  className="text-[0.5rem] flex items-center gap-0.5 press shrink-0"
                  style={{ color: "var(--color-steel)" }}
                >
                  <Phone className="size-2.5" />
                  {data.sellerContact}
                </a>
              ) : null}
            </div>

            {/* Field grid — Date / Area / Cost / Type all in one row, centered */}
            <div className="grid grid-cols-4 gap-1 mt-1.5 pt-1.5 border-t text-center" style={{ borderColor: "var(--color-line)" }}>
              <div className="min-w-0">
                <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  <Calendar className="size-2 inline mr-0.5" />Date
                </p>
                <p className="text-[0.5625rem] font-bold tabular-nums truncate" style={{ color: "var(--color-ink-950)" }}>
                  {formatDate(data.purchaseDate)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  <Maximize className="size-2 inline mr-0.5" />Area
                </p>
                <p className="text-[0.5625rem] font-bold tabular-nums truncate" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(data.totalArea, 0)} {unitShort}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  <IndianRupee className="size-2 inline mr-0.5" />Cost
                </p>
                <p className="text-[0.5625rem] font-bold tabular-nums truncate" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrencyCompact(data.totalCost)}
                </p>
                <p className="text-[0.4375rem] tabular-nums truncate" style={{ color: "var(--color-ink-500)" }}>
                  @ {formatCurrency(data.costPerUnit)}/{unitShort}
                </p>
              </div>
              <div className="min-w-0 flex flex-col gap-0.5 items-center">
                <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Type
                </p>
                <span className="rounded px-1 py-0.5 text-[0.4375rem] font-bold leading-tight whitespace-nowrap"
                  style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-950)" }}>
                  {data.landType === "LEASEHOLD" ? "Leasehold" : "Freehold"}
                </span>
                {data.landType === "LEASEHOLD" && data.leaseType && (
                  <span className="rounded px-1 py-0.5 text-[0.4375rem] font-bold leading-tight whitespace-nowrap"
                    style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}>
                    {data.leaseType === "ONE_TIME" ? "One-time" : "Yearly"}
                    {data.leasePeriodYears ? ` · ${data.leasePeriodYears}y` : ""}
                  </span>
                )}
                {data.mode === "SUBDIVIDED" && (
                  <span className="rounded px-1 py-0.5 text-[0.4375rem] font-bold leading-tight whitespace-nowrap"
                    style={{ backgroundColor: "rgba(100,116,139,0.1)", color: "var(--color-steel)" }}>
                    Sub-divided
                  </span>
                )}
              </div>
            </div>

            {/* Document link — standalone row if present */}
            {data.documentUrl ? (
              <div className="flex items-center justify-end mt-1">
                <a
                  href={data.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 text-[0.5rem] font-semibold press"
                  style={{ color: "var(--color-steel)" }}
                >
                  <FileText className="size-2.5" />
                  View deed
                  <ExternalLink className="size-2" />
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {/* Full-width bottom section — cost breakup + messages fill the space below cadastre */}
        <div className="px-3 pb-2.5 pt-1.5 border-t" style={{ borderColor: "var(--color-line)" }}>
          {/* Cost breakup — full width, right-aligned numbers */}
          {data.baseCost != null && data.baseCost > 0 && (
            <div className="rounded-[0.375rem] border p-2 space-y-0.5"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
              <p className="text-[0.5rem] font-bold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>Cost Breakup</p>
              <div className="flex justify-between text-[0.5rem]">
                <span style={{ color: "var(--color-ink-500)" }}>Base</span>
                <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.baseCost)}</strong>
              </div>
              {data.leaseRentAmount != null && data.leaseRentAmount > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Rent ({data.leaseRentPercent}%)</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.leaseRentAmount)}</strong>
                </div>
              )}
              {data.gstAmount != null && data.gstAmount > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>GST ({data.gstPercent}%)</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.gstAmount)}</strong>
                </div>
              )}
              {data.registrationAmount != null && data.registrationAmount > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Registration ({data.registrationPercent}%)</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.registrationAmount)}</strong>
                </div>
              )}
              {data.stampDutyAmount != null && data.stampDutyAmount > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Stamp Duty ({data.stampDutyPercent}%)</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.stampDutyAmount)}</strong>
                </div>
              )}
              {data.brokerageAmount != null && data.brokerageAmount > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Brokerage</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.brokerageAmount)}</strong>
                </div>
              )}
              {data.legalFees != null && data.legalFees > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Legal Fees</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.legalFees)}</strong>
                </div>
              )}
              {data.otherCharges != null && data.otherCharges > 0 && (
                <div className="flex justify-between text-[0.5rem]">
                  <span style={{ color: "var(--color-ink-500)" }}>Other Charges</span>
                  <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.otherCharges)}</strong>
                </div>
              )}
              <div className="flex justify-between text-[0.5625rem] font-bold pt-1 mt-0.5"
                style={{ borderTop: "1px solid var(--color-line)" }}>
                <span style={{ color: "var(--color-ink-950)" }}>Total Land Cost</span>
                <strong style={{ color: "var(--color-ink-950)" }} className="tabular-nums text-right">{formatCurrency(data.totalCost)}</strong>
              </div>
            </div>
          )}

          {/* Sub-divided notice — full width */}
          {(() => {
            const childParcels = data.parcels.filter((p) => p.parentParcelId);
            const hasPartitionedParent = data.parcels.some((p) => p.status === "PARTITIONED" || p.childCount > 0);
            if (data.mode === "SUBDIVIDED" || (childParcels.length > 0 && hasPartitionedParent)) {
              const plotNumbers = childParcels.map((p) => p.number).join(", ");
              return (
                <div className="mt-1.5 rounded-[0.375rem] border px-3 py-2 text-[0.625rem] leading-snug"
                  style={{
                    borderColor: "rgba(100,116,139,0.4)",
                    backgroundColor: "rgba(100,116,139,0.1)",
                    color: "var(--color-steel)",
                  }}>
                  <Layers className="inline mr-0.5 size-3" />
                  <strong>This land has been sub-divided.</strong> The original whole land no longer exists — it has been converted into {childParcels.length} separate plots:{" "}
                  <strong>{plotNumbers}</strong>. Each plot is now an independent parcel with its own identity, status, and valuation.
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* ── Cadastre zoom popup — click to enlarge, click anywhere to close ── */}
      {cadastreZoom && sortedParcels.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setCadastreZoom(false)}
        >
          <div
            className="rounded-[0.75rem] border p-4 max-w-[20rem] w-full"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
                Cadastre Plan
              </p>
              <button onClick={() => setCadastreZoom(false)} className="press">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div
              className="rounded-[0.5rem] border p-3 mb-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <MobileCadastrePlan parcels={sortedParcels} />
            </div>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {[
                { label: "Available", color: "var(--color-go)", show: data.stats.availableCount > 0 },
                { label: "Hold", color: "var(--color-signal)", show: data.stats.holdCount > 0 },
                { label: "Sold", color: "var(--color-stop)", show: data.stats.soldCount > 0 },
                { label: "Partitioned", color: "var(--color-steel)", show: sortedParcels.some((p) => p.status === "PARTITIONED") },
              ].filter((it) => it.show).map((it) => (
                <span key={it.label} className="flex items-center gap-1 text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: it.color, opacity: 0.6 }} />
                  {it.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Cadastre legend — compact row below the card ── */}
      {sortedParcels.length > 0 ? (
        <div className="flex items-center gap-2.5 mb-3 px-1">
          {[
            { label: "Available", color: "var(--color-go)", show: data.stats.availableCount > 0 },
            { label: "Hold", color: "var(--color-signal)", show: data.stats.holdCount > 0 },
            { label: "Sold", color: "var(--color-stop)", show: data.stats.soldCount > 0 },
            { label: "Partitioned", color: "var(--color-steel)", show: sortedParcels.some((p) => p.status === "PARTITIONED") },
          ].filter((it) => it.show).map((it) => (
            <span key={it.label} className="flex items-center gap-0.5 text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
              <span
                className="h-1.5 w-1.5 rounded-sm"
                style={{ backgroundColor: it.color, opacity: 0.6 }}
              />
              {it.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* ── KPI banner — 4 values ── */}
      <div
        className="grid grid-cols-4 gap-0 rounded-[0.5rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <KpiCell
          label="Unsold"
          value={formatCurrencyCompact(data.stats.unsoldValue)}
        />
        <KpiCell
          label="Gain"
          value={`${gainPositive ? "+" : ""}${formatCurrencyCompact(data.stats.valuationGain)}`}
          tone={gainPositive ? "positive" : "negative"}
        />
        <KpiCell
          label="Avail"
          value={`${data.stats.availableCount}`}
          sub={`${formatNumber(data.stats.availableArea, 0)} ${unitShort}`}
        />
        <KpiCell
          label="Profit"
          value={`${profitPositive ? "+" : ""}${formatCurrencyCompact(data.stats.soldProfit)}`}
          tone={profitPositive ? "positive" : "negative"}
          sub={data.stats.soldCount > 0 ? `${data.stats.soldCount} sold` : undefined}
        />
      </div>

      {/* ── View toggle: Parcels vs Built Units ── */}
      {hasBuiltUnits ? (
        <div
          className="flex rounded-[0.5rem] border mb-3 overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <button
            onClick={() => setView("parcels")}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 text-[0.625rem] font-bold transition-colors press"
            style={{
              backgroundColor: view === "parcels" ? "var(--color-paper)" : "transparent",
              color: view === "parcels" ? "var(--color-ink-950)" : "var(--color-ink-500)",
              boxShadow: view === "parcels" ? "inset 0 -2px 0 var(--color-ink-950)" : "none",
            }}
          >
            <Layers className="size-3" />
            Parcels ({sortedParcels.length})
          </button>
          <button
            onClick={() => setView("units")}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 text-[0.625rem] font-bold transition-colors press"
            style={{
              backgroundColor: view === "units" ? "var(--color-paper)" : "transparent",
              color: view === "units" ? "var(--color-ink-950)" : "var(--color-ink-500)",
              boxShadow: view === "units" ? "inset 0 -2px 0 var(--color-ink-950)" : "none",
            }}
          >
            <Home className="size-3" />
            Built Units ({sortedUnits.length})
          </button>
        </div>
      ) : null}

      {/* ── Parcels view ── */}
      {view === "parcels" ? (
        <div className="mb-4">
          {!hasBuiltUnits ? (
            <p className="text-[0.625rem] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-600)" }}>
              Parcels ({sortedParcels.length})
            </p>
          ) : null}

          {sortedParcels.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <Layers className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-[0.625rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
                No parcels
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedParcels.map((p) => (
                <ParcelCard
                  key={p.id}
                  parcel={p}
                  unitShort={unitShort}
                  canManage={canManage}
                  canPartition={canPartition}
                  canSell={canSell}
                  customers={customers}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Built Units view ── */}
      {view === "units" && hasBuiltUnits ? (
        <div className="mb-4">
          {sortedUnits.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <Home className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-[0.625rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
                No built units
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedUnits.map((u) => (
                <BuiltUnitCard key={u.id} unit={u} unitShort={unitShort} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Sales section ── */}
      {data.sales.length > 0 ? (
        <div className="mb-4">
          <p className="text-[0.625rem] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-600)" }}>
            Sales ({data.sales.length})
          </p>
          <div className="flex flex-col gap-2">
            {data.sales.map((s) => (
              <SaleCard key={s.id} sale={s} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Legal documents section ── */}
      <div className="mb-4">
        <MobileLegalDocsSection
          docs={data.legalDocs ?? []}
          landPurchaseId={data.id}
          canManage={canManageLegal}
          context="LAND"
        />
      </div>

      {/* ── Un-divide action — only for OWNER/ADMIN (canPartition) when land is sub-divided ── */}
      {canPartition && (() => {
        const partitionedParent = data.parcels.find((p) => p.status === "PARTITIONED");
        if (!partitionedParent) return null;
        return (
          <div className="mb-3">
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "Un-divide this land?",
                  description: `This will remove all ${partitionedParent.childCount} sub-parcels and restore the original whole plot "${partitionedParent.number}" to Available. This cannot be undone if any sub-parcel has been sold.`,
                  confirmLabel: "Un-divide",
                  variant: "destructive",
                });
                if (!ok) return;
                fetch("/api/land-parcels", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "unpartition", parentParcelId: partitionedParent.id }),
                })
                  .then((r) => r.json())
                  .then((r) => {
                    if (r.error) throw new Error(r.error);
                    toast.success("Land un-divided — original plot restored");
                    router.refresh();
                  })
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to un-divide"));
              }}
              className="w-full flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-semibold press"
              style={{ borderColor: "rgba(100,116,139,0.4)", backgroundColor: "rgba(100,116,139,0.1)", color: "var(--color-steel)" }}
            >
              <Split className="size-3 rotate-180" />
              Un-divide Land
            </button>
          </div>
        );
      })()}

      {/* ── Purchase actions ── */}
      {canManage ? (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowEdit(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-semibold press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
          >
            <Pencil className="size-3" />
            Edit
          </button>
          <button
            onClick={async () => {
              const ok = await confirm({
                title: "Archive land purchase?",
                description: "All parcels will be archived too.",
                confirmLabel: "Archive",
                variant: "destructive",
              });
              if (!ok) return;
              fetch(`/api/land-purchases/${data.id}`, { method: "DELETE" })
                .then((r) => r.json())
                .then((r) => {
                  if (r.error) throw new Error(r.error);
                  toast.success("Land purchase archived");
                  router.push("/m/land");
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to archive"));
            }}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-semibold press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-stop)" }}
          >
            <Trash2 className="size-3" />
            Archive
          </button>
        </div>
      ) : null}

      {/* ── Edit form ── */}
      {showEdit ? (
        <MobileLandEditForm
          land={data}
          onClose={() => setShowEdit(false)}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

/* ─── KPI cell ─── */
function KpiCell({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="p-2 text-center border-r last:border-r-0" style={{ borderColor: "var(--color-line)" }}>
      <p className="text-[0.5625rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
      <p
        className="text-[0.6875rem] font-bold tabular-nums leading-tight mt-0.5"
        style={{ color: tone === "positive" ? "var(--color-go)" : tone === "negative" ? "var(--color-stop)" : "var(--color-ink-950)" }}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-[0.5625rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Parcel card — the core unit of land management ─── */
function ParcelCard({
  parcel: p,
  unitShort,
  canManage,
  canPartition,
  canSell,
  customers,
}: {
  parcel: Parcel;
  unitShort: string;
  canManage: boolean;
  canPartition: boolean;
  canSell: boolean;
  customers: Customer[];
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [showPartition, setShowPartition] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showValuate, setShowValuate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const meta = STATUS_META[p.status] ?? STATUS_META.AVAILABLE;
  const StatusIcon = meta!.icon;
  const isPartitioned = p.status === "PARTITIONED";
  const isAvailable = p.status === "AVAILABLE";
  const isSold = p.salePrice != null;

  const gain = p.currentValuation - p.acquisitionCost;
  const gainPct = p.acquisitionCost > 0 ? Math.round((gain / p.acquisitionCost) * 100) : 0;

  const handleStatusToggle = async () => {
    const newStatus = isAvailable ? "HOLD" : "AVAILABLE";
    const action = newStatus === "HOLD" ? "hold" : "release";
    setActing("status");
    try {
      const res = await fetch(`/api/land-parcels/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to change status");
      }
      toast.success(newStatus === "HOLD" ? "Parcel put on hold" : "Parcel released");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async () => {
    setActing("delete");
    try {
      const res = await fetch(`/api/land-parcels/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
      toast.success("Parcel deleted");
      setShowDelete(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-[0.5rem] border"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* Status accent strip */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: meta!.color }}
      />

      <div className="pl-3.5 pr-3 py-2.5">
        {/* ── Top: number + status ── */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[0.75rem] font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>
              {p.number}
            </p>
            {p.parentParcelNumber ? (
              <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                from {p.parentParcelNumber}
              </span>
            ) : null}
            {p.isInfrastructure ? (
              <span className="text-[0.5625rem] font-semibold px-1 py-0.5 rounded" style={{ color: "var(--color-steel)", backgroundColor: "var(--color-paper-2)" }}>
                INFRA
              </span>
            ) : null}
            {p.purpose && PURPOSE_META[p.purpose] ? (
              <span
                className="flex items-center gap-0.5 text-[0.5625rem] font-semibold px-1 py-0.5 rounded"
                style={{ color: PURPOSE_META[p.purpose]!.color, backgroundColor: `color-mix(in srgb, ${PURPOSE_META[p.purpose]!.color} 10%, transparent)` }}
              >
                {(() => { const Icon = PURPOSE_META[p.purpose]!.icon; return <Icon className="size-2" />; })()}
                {PURPOSE_META[p.purpose]!.label}
              </span>
            ) : null}
          </div>
          <span
            className="flex items-center gap-0.5 text-[0.5625rem] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ color: meta!.color, backgroundColor: `color-mix(in srgb, ${meta!.color} 12%, transparent)` }}
          >
            <StatusIcon className="size-2.5" />
            {meta!.label}
          </span>
        </div>

        {/* ── Stats row ── */}
        <div className="flex items-center gap-3">
          {/* Area */}
          <div>
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Area
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(p.area, 0)} {unitShort}
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          {/* Cost */}
          <div>
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Cost
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {formatCurrencyCompact(p.acquisitionCost)}
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          {/* Value */}
          <div>
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Value
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(p.currentValuation)}
            </p>
          </div>

          {/* Asking */}
          {p.askingPrice ? (
            <>
              <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
              <div>
                <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Asking
                </p>
                <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(p.askingPrice)}
                </p>
              </div>
            </>
          ) : null}

          {/* Gain */}
          <div className="ml-auto text-right">
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Δ
            </p>
            <p
              className="text-[0.6875rem] font-bold tabular-nums flex items-center justify-end gap-0.5"
              style={{ color: gain >= 0 ? "var(--color-go)" : "var(--color-stop)" }}
            >
              {gain >= 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
              {gainPct > 0 ? "+" : ""}{gainPct}%
            </p>
          </div>
        </div>

        {/* ── Sale info (if sold) ── */}
        {isSold ? (
          <div
            className="mt-2 pt-2 border-t flex items-center gap-2 text-[0.5rem]"
            style={{ borderColor: "var(--color-line)" }}
          >
            <DollarSign className="size-2.5" style={{ color: "var(--color-go)" }} />
            <span style={{ color: "var(--color-ink-700)" }}>
              Sold to {p.customerName} for {formatCurrency(p.salePrice!)}
            </span>
            <span className="ml-auto font-mono" style={{ color: "var(--color-ink-500)" }}>
              {p.saleNumber}
            </span>
          </div>
        ) : null}

        {/* ── Partitioned children count + un-divide button (OWNER/ADMIN only) ── */}
        {isPartitioned ? (
          <div
            className="mt-2 pt-2 border-t flex items-center gap-1.5 text-[0.5rem]"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
          >
            <Split className="size-2.5" />
            Split into {p.childCount} sub-parcels
            {canPartition ? (
              <button
                onClick={async () => {
                  if (!window.confirm(`Un-divide this parcel? This will remove all ${p.childCount} sub-parcels and restore "${p.number}" to Available.`)) return;
                  setActing("unpartition");
                  fetch("/api/land-parcels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "unpartition", parentParcelId: p.id }),
                  })
                    .then((r) => r.json())
                    .then((r) => {
                      if (r.error) throw new Error(r.error);
                      toast.success("Parcel un-divided — original plot restored");
                      router.refresh();
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to un-divide"))
                    .finally(() => setActing(null));
                }}
                disabled={acting === "unpartition"}
                className="ml-auto flex items-center gap-0.5 text-[0.5625rem] font-bold px-1.5 py-0.5 rounded press"
                style={{ color: "var(--color-steel)", backgroundColor: "rgba(100,116,139,0.1)" }}
              >
                {acting === "unpartition" ? <Loader2 className="size-2.5 animate-spin" /> : <Split className="size-2.5 rotate-180" />}
                Un-divide
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Action bar ── */}
      {!isPartitioned && !isSold && (canManage || canPartition || canSell) ? (
        <div
          className="flex items-center gap-1 px-2.5 py-1.5 border-t"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          {/* Hold / Release */}
          {canManage ? (
            <button
              onClick={handleStatusToggle}
              disabled={acting === "status"}
              className="flex items-center gap-0.5 text-[0.625rem] font-semibold px-2 py-1 rounded press"
              style={{
                color: isAvailable ? "var(--color-signal)" : "var(--color-go)",
                backgroundColor: `color-mix(in srgb, ${isAvailable ? "var(--color-signal)" : "var(--color-go)"} 10%, transparent)`,
              }}
            >
              {acting === "status" ? <Loader2 className="size-2.5 animate-spin" /> : isAvailable ? <PauseCircle className="size-2.5" /> : <CheckCircle2 className="size-2.5" />}
              {isAvailable ? "Hold" : "Release"}
            </button>
          ) : null}

          {/* Valuate */}
          {canManage ? (
            <button
              onClick={() => setShowValuate(true)}
              className="flex items-center gap-0.5 text-[0.625rem] font-semibold px-2 py-1 rounded press"
              style={{ color: "var(--color-ink-600)", backgroundColor: "var(--color-paper)" }}
            >
              <Tag className="size-2.5" />
              Valuate
            </button>
          ) : null}

          {/* Partition */}
          {canPartition ? (
            <button
              onClick={() => setShowPartition(true)}
              className="flex items-center gap-0.5 text-[0.625rem] font-semibold px-2 py-1 rounded press"
              style={{ color: "var(--color-steel)", backgroundColor: "var(--color-paper)" }}
            >
              <Split className="size-2.5" />
              Partition
            </button>
          ) : null}

          {/* Sell */}
          {canSell ? (
            <button
              onClick={() => setShowSell(true)}
              className="flex items-center gap-0.5 text-[0.625rem] font-semibold px-2 py-1 rounded press ml-auto"
              style={{ color: "var(--color-go)", backgroundColor: `color-mix(in srgb, var(--color-go) 10%, transparent)` }}
            >
              <DollarSign className="size-2.5" />
              Sell
            </button>
          ) : null}

          {/* Delete */}
          {canManage ? (
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-0.5 text-[0.625rem] font-semibold px-2 py-1 rounded press"
              style={{ color: "var(--color-stop)" }}
            >
              <Trash2 className="size-2.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Partition bottom-sheet ── */}
      {showPartition ? (
        <PartitionSheet
          parcel={p}
          unitShort={unitShort}
          onClose={() => setShowPartition(false)}
          onDone={() => { setShowPartition(false); router.refresh(); }}
        />
      ) : null}

      {/* ── Sell bottom-sheet ── */}
      {showSell ? (
        <SellSheet
          parcel={p}
          unitShort={unitShort}
          customers={customers}
          onClose={() => setShowSell(false)}
          onDone={() => { setShowSell(false); router.refresh(); }}
        />
      ) : null}

      {/* ── Valuation bottom-sheet ── */}
      {showValuate ? (
        <ValuationSheet
          parcel={p}
          onClose={() => setShowValuate(false)}
          onDone={() => { setShowValuate(false); router.refresh(); }}
        />
      ) : null}

      {/* ── Delete confirmation ── */}
      {showDelete ? (
        <DeleteSheet
          parcel={p}
          acting={acting === "delete"}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      ) : null}
    </div>
  );
}

/* ─── Built Unit card — a flat/shop constructed on the land ─── */
const UNIT_TYPE_LABEL: Record<string, string> = {
  APARTMENT: "Apartment",
  SHOP: "Shop",
  OFFICE: "Office",
  VILLA: "Villa",
  PLOT: "Plot",
};

const UNIT_STATUS_META: Record<string, { color: string; label: string }> = {
  AVAILABLE: { color: "var(--color-go)", label: "Available" },
  BOOKED: { color: "var(--color-signal)", label: "Booked" },
  SOLD: { color: "var(--color-stop)", label: "Sold" },
  UNDER_CONSTRUCTION: { color: "var(--color-steel)", label: "U/C" },
  READY: { color: "var(--color-go)", label: "Ready" },
};

function BuiltUnitCard({ unit: u, unitShort }: { unit: BuiltUnit; unitShort: string }) {
  const meta = UNIT_STATUS_META[u.status] ?? { color: "var(--color-ink-500)", label: u.status };
  const cost = u.originType === "PURCHASED" ? u.acquisitionCost : u.productionCost;
  const gain = u.currentValuation - cost;
  const gainPct = cost > 0 ? Math.round((gain / cost) * 100) : 0;

  return (
    <div
      className="relative overflow-hidden rounded-[0.5rem] border"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: meta.color }}
      />

      <div className="pl-3.5 pr-3 py-2.5">
        {/* ── Top: unit number + type + status ── */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {u.unitNumber}
            </p>
            <span className="text-[0.5625rem] font-semibold px-1 py-0.5 rounded" style={{ color: "var(--color-ink-600)", backgroundColor: "var(--color-paper-2)" }}>
              {UNIT_TYPE_LABEL[u.unitType] ?? u.unitType}
            </span>
            {u.originType === "PURCHASED" ? (
              <span className="text-[0.5625rem] font-semibold px-1 py-0.5 rounded" style={{ color: "var(--color-steel)", backgroundColor: "var(--color-paper-2)" }}>
                PURCHASED
              </span>
            ) : null}
          </div>
          <span
            className="flex items-center gap-0.5 text-[0.5625rem] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
          >
            {meta.label}
          </span>
        </div>

        {/* ── Location info ── */}
        <p className="text-[0.5rem] mb-1.5" style={{ color: "var(--color-ink-500)" }}>
          {u.landParcelNumber ? `Parcel ${u.landParcelNumber}` : "—"}
          {u.wing ? ` · Wing ${u.wing}` : ""}
          {u.floor != null ? ` · Floor ${u.floor}` : ""}
          {" · "}{u.projectName}
        </p>

        {/* ── Stats row ── */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Area
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(u.area, 0)} {unitShort}
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          <div>
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              {u.originType === "PURCHASED" ? "Acquired" : "Production"}
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {formatCurrencyCompact(cost)}
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          <div>
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Value
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(u.currentValuation)}
            </p>
          </div>

          {u.askingPrice ? (
            <>
              <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
              <div>
                <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Asking
                </p>
                <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(u.askingPrice)}
                </p>
              </div>
            </>
          ) : null}

          <div className="ml-auto text-right">
            <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Δ
            </p>
            <p
              className="text-[0.6875rem] font-bold tabular-nums flex items-center justify-end gap-0.5"
              style={{ color: gain >= 0 ? "var(--color-go)" : "var(--color-stop)" }}
            >
              {gain >= 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
              {gainPct > 0 ? "+" : ""}{gainPct}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sale card ─── */
function SaleCard({ sale: s }: { sale: Sale }) {
  const profitPositive = s.profit >= 0;
  return (
    <Link
      href="/m/sales"
      className="block rounded-[0.5rem] border p-2.5 press active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[0.5rem] font-mono font-bold" style={{ color: "var(--color-ink-950)" }}>
          {s.saleNumber}
        </span>
        <span className="text-[0.5625rem] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: "var(--color-go)", backgroundColor: `color-mix(in srgb, var(--color-go) 12%, transparent)` }}>
          {s.saleStage}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Parcel
          </p>
          <p className="text-[0.625rem] font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>
            {s.parcelNumber}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Buyer
          </p>
          <p className="text-[0.625rem] font-bold truncate max-w-[80px]" style={{ color: "var(--color-ink-950)" }}>
            {s.customerName}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Price
          </p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(s.salePrice)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Profit
          </p>
          <p
            className="text-[0.6875rem] font-bold tabular-nums"
            style={{ color: profitPositive ? "var(--color-go)" : "var(--color-stop)" }}
          >
            {profitPositive ? "+" : ""}{formatCurrencyCompact(s.profit)}
          </p>
        </div>
      </div>
    </Link>
  );
}

/* ─── Partition bottom-sheet ─── */
function PartitionSheet({
  parcel, unitShort, onClose, onDone,
}: {
  parcel: Parcel;
  unitShort: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [children, setChildren] = useState([
    { number: "", area: "", askingPrice: "" },
    { number: "", area: "", askingPrice: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalChildArea = children.reduce((s, c) => s + (parseFloat(c.area) || 0), 0);
  const areaMatch = Math.abs(totalChildArea - parcel.area) < 0.01;

  const addChild = () => setChildren([...children, { number: "", area: "", askingPrice: "" }]);
  const removeChild = (i: number) => setChildren(children.filter((_, idx) => idx !== i));
  const updateChild = (i: number, field: "number" | "area" | "askingPrice", value: string) => {
    setChildren(children.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!areaMatch) {
      setError(`Child areas must sum to ${formatNumber(parcel.area, 0)} ${unitShort}. Currently: ${formatNumber(totalChildArea, 0)}`);
      return;
    }
    const validChildren = children.filter((c) => c.number.trim() && c.area);
    if (validChildren.length < 2) {
      setError("At least 2 sub-parcels required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/land-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "partition",
          parentParcelId: parcel.id,
          children: validChildren.map((c) => ({
            number: c.number.trim(),
            area: parseFloat(c.area),
            askingPrice: c.askingPrice ? parseFloat(c.askingPrice) : undefined,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Partition failed");
      }
      toast.success(`Partitioned into ${validChildren.length} sub-parcels`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet title={`Partition ${parcel.number}`} onClose={onClose}>
      {/* Parent info */}
      <div className="rounded-[0.5rem] border p-2 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
        <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
          Parent: <span className="font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>{parcel.number}</span>
          {" — "}{formatNumber(parcel.area, 0)} {unitShort}
        </p>
      </div>

      {/* Children */}
      <div className="flex flex-col gap-2 mb-3">
        {children.map((c, i) => (
          <div key={i} className="rounded-[0.5rem] border p-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-600)" }}>
                Sub-parcel {i + 1}
              </span>
              {children.length > 2 ? (
                <button onClick={() => removeChild(i)} className="press">
                  <X className="size-3" style={{ color: "var(--color-stop)" }} />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="text"
                placeholder="Number"
                value={c.number}
                onChange={(e) => updateChild(i, "number", e.target.value)}
                className="h-8 rounded border px-2 text-[0.625rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
              <input
                type="text" inputMode="decimal"
                placeholder={`Area (${unitShort})`}
                value={c.area}
                onChange={(e) => updateChild(i, "area", e.target.value)}
                className="h-8 rounded border px-2 text-[0.625rem] tabular-nums outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
              <input
                type="text" inputMode="decimal"
                placeholder="Asking ₹"
                value={c.askingPrice}
                onChange={(e) => updateChild(i, "askingPrice", e.target.value)}
                className="h-8 rounded border px-2 text-[0.625rem] tabular-nums outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addChild}
        className="w-full flex items-center justify-center gap-1 h-8 rounded-[0.5rem] border text-[0.625rem] font-semibold press mb-3"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-600)" }}
      >
        <Plus className="size-3" />
        Add sub-parcel
      </button>

      {/* Area check */}
      <div
        className="rounded-[0.5rem] p-2 mb-3 flex items-center gap-1.5 text-[0.5rem]"
        style={{
          backgroundColor: areaMatch ? `color-mix(in srgb, var(--color-go) 8%, transparent)` : `color-mix(in srgb, var(--color-signal) 8%, transparent)`,
          color: areaMatch ? "var(--color-go)" : "var(--color-signal)",
        }}
      >
        {areaMatch ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
        {formatNumber(totalChildArea, 0)} / {formatNumber(parcel.area, 0)} {unitShort}
        {areaMatch ? " ✓" : ` (${formatNumber(parcel.area - totalChildArea, 0)} remaining)`}
      </div>

      {error ? (
        <p className="text-[0.5rem] mb-2" style={{ color: "var(--color-stop)" }}>{error}</p>
      ) : null}

      <button
        onClick={handleSubmit}
        disabled={submitting || !areaMatch}
        className="w-full h-9 rounded-[0.5rem] text-[0.625rem] font-bold press disabled:opacity-50"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : `Partition into ${children.filter(c => c.number.trim() && c.area).length} parcels`}
      </button>
    </BottomSheet>
  );
}

/* ─── Sell bottom-sheet ─── */
function SellSheet({
  parcel, unitShort, customers, onClose, onDone,
}: {
  parcel: Parcel;
  unitShort: string;
  customers: Customer[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [salePrice, setSalePrice] = useState(parcel.askingPrice?.toString() ?? "");
  const [initialPayment, setInitialPayment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  }, [customers, customerSearch]);

  const price = parseFloat(salePrice) || 0;
  const profit = price - parcel.acquisitionCost;
  const profitPct = parcel.acquisitionCost > 0 ? Math.round((profit / parcel.acquisitionCost) * 100) : 0;

  const handleSubmit = async () => {
    setError(null);
    if (!selectedCustomer) { setError("Select a customer"); return; }
    if (price <= 0) { setError("Enter a valid sale price"); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        assetType: "LAND",
        landParcelId: parcel.id,
        customerId: selectedCustomer.id,
        salePrice: price,
      };
      if (initialPayment) {
        body.initialPayment = parseFloat(initialPayment);
      }
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Sale failed");
      }
      const result = await res.json();
      toast.success(`Sale ${result.saleNumber} created`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet title={`Sell ${parcel.number}`} onClose={onClose}>
      {/* Parcel summary */}
      <div className="rounded-[0.5rem] border p-2 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
        <div className="flex items-center gap-3 text-[0.5rem]">
          <span style={{ color: "var(--color-ink-500)" }}>
            {formatNumber(parcel.area, 0)} {unitShort}
          </span>
          <span style={{ color: "var(--color-ink-500)" }}>
            Cost: <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>{formatCurrency(parcel.acquisitionCost)}</span>
          </span>
          {parcel.askingPrice ? (
            <span style={{ color: "var(--color-go)" }}>
              Asking: <span className="font-bold tabular-nums">{formatCurrency(parcel.askingPrice)}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Customer picker */}
      {!selectedCustomer ? (
        <div className="mb-3">
          <p className="text-[0.625rem] font-bold uppercase mb-1.5" style={{ color: "var(--color-ink-600)" }}>
            Select Buyer
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
            <input
              type="search"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full h-9 rounded-[0.5rem] border pl-8 pr-3 text-[0.625rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <p className="text-[0.5rem] text-center py-3" style={{ color: "var(--color-ink-500)" }}>
                No customers found
              </p>
            ) : (
              filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 text-left press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <span className="text-[0.625rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
                    {c.name}
                  </span>
                  <ChevronRight className="size-3" style={{ color: "var(--color-ink-500)" }} />
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-[0.625rem] font-bold uppercase mb-1.5" style={{ color: "var(--color-ink-600)" }}>
            Buyer
          </p>
          <div
            className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <span className="text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {selectedCustomer.name}
            </span>
            <button onClick={() => setSelectedCustomer(null)} className="press">
              <X className="size-3" style={{ color: "var(--color-ink-500)" }} />
            </button>
          </div>
        </div>
      )}

      {/* Sale price */}
      <div className="mb-3">
        <p className="text-[0.625rem] font-bold uppercase mb-1" style={{ color: "var(--color-ink-600)" }}>
          Sale Price (₹)
        </p>
        <input
          type="text" inputMode="decimal"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
          placeholder="Enter sale price"
          className="w-full h-9 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums outline-none"
          style={{ borderColor: salePrice ? "var(--color-ink-950)" : "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
        {price > 0 ? (
          <p className="text-[0.5rem] mt-1 flex items-center gap-1" style={{ color: profit >= 0 ? "var(--color-go)" : "var(--color-stop)" }}>
            {profit >= 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
            Profit: {formatCurrency(profit)} ({profitPct > 0 ? "+" : ""}{profitPct}%)
          </p>
        ) : null}
      </div>

      {/* Initial payment (optional) */}
      <div className="mb-3">
        <p className="text-[0.625rem] font-bold uppercase mb-1" style={{ color: "var(--color-ink-600)" }}>
          Initial Payment (₹) <span style={{ color: "var(--color-ink-500)" }}>(optional)</span>
        </p>
        <input
          type="text" inputMode="decimal"
          value={initialPayment}
          onChange={(e) => setInitialPayment(e.target.value)}
          placeholder="Token / deposit amount"
          className="w-full h-9 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums outline-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
      </div>

      {error ? (
        <p className="text-[0.5rem] mb-2" style={{ color: "var(--color-stop)" }}>{error}</p>
      ) : null}

      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedCustomer || price <= 0}
        className="w-full h-9 rounded-[0.5rem] text-[0.625rem] font-bold press disabled:opacity-50"
        style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
      >
        {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Create Sale"}
      </button>
    </BottomSheet>
  );
}

/* ─── Valuation bottom-sheet ─── */
function ValuationSheet({
  parcel, onClose, onDone,
}: {
  parcel: Parcel;
  onClose: () => void;
  onDone: () => void;
}) {
  const [valuation, setValuation] = useState(parcel.currentValuation.toString());
  const [askingPrice, setAskingPrice] = useState(parcel.askingPrice?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const val = parseFloat(valuation);
    if (val <= 0) { setError("Enter a valid valuation"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/land-parcels/${parcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "valuate",
          currentValuation: val,
          askingPrice: askingPrice ? parseFloat(askingPrice) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Valuation failed");
      }
      toast.success("Valuation updated");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const gain = (parseFloat(valuation) || 0) - parcel.acquisitionCost;
  const gainPct = parcel.acquisitionCost > 0 ? Math.round((gain / parcel.acquisitionCost) * 100) : 0;

  return (
    <BottomSheet title={`Valuate ${parcel.number}`} onClose={onClose}>
      <div className="rounded-[0.5rem] border p-2 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
        <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
          Cost basis: <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>{formatCurrency(parcel.acquisitionCost)}</span>
        </p>
      </div>

      <div className="mb-3">
        <p className="text-[0.625rem] font-bold uppercase mb-1" style={{ color: "var(--color-ink-600)" }}>
          Current Valuation (₹)
        </p>
        <input
          type="text" inputMode="decimal"
          value={valuation}
          onChange={(e) => setValuation(e.target.value)}
          className="w-full h-9 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums outline-none"
          style={{ borderColor: valuation ? "var(--color-ink-950)" : "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
        {gain !== 0 ? (
          <p className="text-[0.5rem] mt-1" style={{ color: gain >= 0 ? "var(--color-go)" : "var(--color-stop)" }}>
            {gain >= 0 ? "+" : ""}{formatCurrency(gain)} ({gainPct > 0 ? "+" : ""}{gainPct}%)
          </p>
        ) : null}
      </div>

      <div className="mb-3">
        <p className="text-[0.625rem] font-bold uppercase mb-1" style={{ color: "var(--color-ink-600)" }}>
          Asking Price (₹) <span style={{ color: "var(--color-ink-500)" }}>(optional)</span>
        </p>
        <input
          type="text" inputMode="decimal"
          value={askingPrice}
          onChange={(e) => setAskingPrice(e.target.value)}
          placeholder="List price for sale"
          className="w-full h-9 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums outline-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
      </div>

      {error ? (
        <p className="text-[0.5rem] mb-2" style={{ color: "var(--color-stop)" }}>{error}</p>
      ) : null}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-9 rounded-[0.5rem] text-[0.625rem] font-bold press disabled:opacity-50"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Update Valuation"}
      </button>
    </BottomSheet>
  );
}

/* ─── Delete confirmation ─── */
function DeleteSheet({
  parcel, acting, onConfirm, onClose,
}: {
  parcel: Parcel;
  acting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet title={`Delete ${parcel.number}?`} onClose={onClose}>
      <div className="rounded-[0.5rem] border p-3 mb-3" style={{ borderColor: "var(--color-stop)", backgroundColor: `color-mix(in srgb, var(--color-stop) 5%, transparent)` }}>
        <p className="text-[0.625rem]" style={{ color: "var(--color-ink-700)" }}>
          Parcel <span className="font-bold font-mono">{parcel.number}</span> will be permanently deleted.
        </p>
        <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          Only available for AVAILABLE or HOLD parcels with no sales.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={acting}
          className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={acting}
          className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press disabled:opacity-50"
          style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
        >
          {acting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Delete"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Bottom sheet primitive ─── */
function BottomSheet({
  title, children, onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full max-w-md rounded-t-[0.75rem] border-t max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 pt-2 pb-1" style={{ backgroundColor: "var(--color-paper)" }}>
          <div className="w-8 h-0.5 rounded-full mx-auto mb-2" style={{ backgroundColor: "var(--color-ink-300)" }} />
          <div className="flex items-center justify-between px-3 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {title}
            </p>
            <button onClick={onClose} className="press">
              <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
            </button>
          </div>
        </div>
        <div className="p-3">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Mobile Cadastre Plan — visual parcel treemap using mobile color tokens ─── */
function MobileCadastrePlan({ parcels }: { parcels: Parcel[] }) {
  const cells = useMemo(() => {
    const leaves = parcels.filter((p) => p.status !== "PARTITIONED");
    const targets = leaves.length > 0 ? leaves : parcels;
    const sorted = [...targets].sort((a, b) => b.area - a.area);
    if (sorted.length === 0) return [];

    const totalArea = sorted.reduce((s, p) => s + p.area, 0);
    if (totalArea <= 0) return [];

    const targetRows = Math.max(1, Math.round(Math.sqrt(sorted.length)));
    const targetRowArea = totalArea / targetRows;

    const rows: Parcel[][] = [];
    let currentRow: Parcel[] = [];
    let currentRowArea = 0;

    for (const p of sorted) {
      if (currentRowArea + p.area > targetRowArea * 1.4 && currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
        currentRowArea = 0;
      }
      currentRow.push(p);
      currentRowArea += p.area;
    }
    if (currentRow.length > 0) rows.push(currentRow);

    const result: { parcel: Parcel; x: number; y: number; w: number; h: number }[] = [];
    let y = 0;
    const W = 100, H = 100;
    for (const row of rows) {
      const rowArea = row.reduce((s, p) => s + p.area, 0);
      const rowHeight = (rowArea / totalArea) * H;
      let x = 0;
      for (const p of row) {
        const w = (p.area / rowArea) * W;
        result.push({ parcel: p, x, y, w, h: rowHeight });
        x += w;
      }
      y += rowHeight;
    }
    return result;
  }, [parcels]);

  if (parcels.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "100 / 50",
          backgroundColor: "var(--color-paper-2)",
          borderRadius: "0.375rem",
        }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: "100%", height: "auto", display: "block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {cells.map((cell) => {
        const { parcel } = cell;
        const fill = CADASTRE_FILL[parcel.status] ?? "var(--color-steel)";
        const cx = cell.x + cell.w / 2;
        const cy = cell.y + cell.h / 2;
        const cellArea = cell.w * cell.h;
        const showText = cellArea > 80;
        const areaStr = formatNumber(parcel.area, 0);
        // Monospace char ≈ 0.6× fontSize wide. Fit text inside cell with 2-unit padding.
        const nameFont = Math.min(8, (cell.w - 2) / (parcel.number.length * 0.6));
        const areaFont = Math.min(8, (cell.w - 2) / (areaStr.length * 0.6));
        // Stack vertically: name on top, area below — only if cell is tall enough
        const canStack = cell.h > 20;
        const nameY = canStack ? cy - 4 : cy;
        const areaY = cy + Math.min(6, cell.h / 4);

        return (
          <g key={parcel.id}>
            <rect
              x={cell.x}
              y={cell.y}
              width={cell.w}
              height={cell.h}
              fill={fill}
              fillOpacity={0.35}
              stroke={fill}
              strokeWidth={1.5}
              rx={1}
            />
            {showText && (
              <text
                x={cx}
                y={nameY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-ink-950)"
                fontSize={nameFont}
                fontWeight={700}
                style={{ fontFamily: "var(--font-mono)", pointerEvents: "none" }}
              >
                {parcel.number}
              </text>
            )}
            {showText && cellArea > 180 && canStack && (
              <text
                x={cx}
                y={areaY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-ink-900)"
                fontSize={areaFont}
                fontWeight={700}
                style={{ fontFamily: "var(--font-mono)", pointerEvents: "none" }}
              >
                {areaStr}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
