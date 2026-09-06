"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, FileText, Trophy, ChevronRight, Loader2 } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";

import { MobileQuotationDetail } from "./[id]/MobileQuotationDetail";

export type QuotationListItem = {
  id: string;
  requestNumber: string;
  title: string;
  status: string;
  projectName: string | null;
  submittedByName: string;
  createdAt: string;
  lineCount: number;
  quoteCount: number;
  minQuotesRequired: number;
  quotesMet: boolean;
  selectedQuoteId: string | null;
  cheapestLandedTotal: number | null;
  isPendingMyApproval: boolean;
  convertedPo?: { id: string; poNumber: string; status: string } | null;
};

type Catalog = {
  projects: { id: string; name: string }[];
  materials: {
    id: string;
    name: string;
    code: string;
    unit: string;
    hsnCode: string | null;
    gstRate: number;
  }[];
};

type TabKey = "all" | "mine" | "pending";

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  OPEN: { color: "var(--color-ink-400)", label: "Open" },
  QUOTES_COLLECTED: { color: "var(--color-signal)", label: "Quotes In" },
  APPROVED: { color: "var(--color-go)", label: "Approved" },
  CLOSED: { color: "var(--color-steel)", label: "Closed" },
  CANCELLED: { color: "var(--color-stop)", label: "Cancelled" },
};

export function MobileQuotationsList({
  items,
  canCreate,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  catalog,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: QuotationListItem[];
  canCreate?: boolean;
  catalog: Catalog;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [overlayKey, setOverlayKey] = useState(0);

  useEffect(() => {
    const open = searchParams.get("open");
    if (open) {
      setOpenId(open);
    } else {
      setOpenId(null);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    let result = items;
    if (tab === "pending") result = result.filter((r) => r.isPendingMyApproval);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.requestNumber.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.projectName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, tab]);

  const pendingCount = items.filter((r) => r.isPendingMyApproval).length;

  function openDetail(id: string) {
    setOpenId(id);
    router.replace(`/m/procurement?tab=quotations&open=${id}`, { scroll: false });
  }

  return (
    <div>
      {/* ── Summary strip (same position across all procurement tabs) ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Total", value: String(items.length) },
          { label: "Open", value: String(items.filter((r) => r.status === "OPEN").length) },
          { label: "Pending", value: String(pendingCount) },
          { label: "Closed", value: String(items.filter((r) => r.status === "CLOSED").length) },
        ]}
      />

      {/* ── Sticky search header (same position across all procurement tabs) ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search quote no, title, project…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={[
                { label: "All", value: "all" },
                { label: "Mine", value: "mine" },
                {
                  label: `Pending Approval${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
                  value: "pending",
                },
              ]}
              active={tab}
              defaultValue="all"
              onChange={(v) => setTab(v as TabKey)}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={query !== "" || tab !== "all"}
        onClear={() => {
          setQuery("");
          setTab("all");
        }}
      />

      {items.length === 0 ? (
        <MobileEmptyState
          icon={FileText}
          title="No quotation requests"
          description={
            canCreate
              ? "Tap the + button below to create your first quotation request."
              : "Quotation requests will appear here once created."
          }
        />
      ) : (
        <>

          {filtered.length === 0 ? (
            <MobileNoResults
              title={
                tab === "pending"
                  ? "No pending approvals"
                  : "No quotation requests found"
              }
              query={query || undefined}
              hint={
                tab === "pending"
                  ? "You have no quotation requests awaiting your approval"
                  : "Try a different filter."
              }
            />
          ) : (
            <div>
              {(query || tab !== "all") && (
                <div className="flex items-center justify-end mb-1.5">
                  <span
                    className="text-m-label font-semibold"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {filtered.length} request{filtered.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {filtered.map((r) => (
                  <QuotationCard
                    key={r.id}
                    req={r}
                    onOpen={() => openDetail(r.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {openId ? (
        <QuotationAnalysisOverlay
          key={`${openId}-${overlayKey}`}
          id={openId}
          onClose={() => {
            setOpenId(null);
            // Clear the ?open= URL param so the useEffect doesn't reopen the overlay
            if (searchParams.get("open")) {
              router.replace("/m/procurement?tab=quotations", { scroll: false });
            }
            router.refresh();
          }}
          onChanged={() => {
            setOverlayKey((k) => k + 1);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function QuotationCard({
  req,
  onOpen,
}: {
  req: QuotationListItem;
  onOpen: () => void;
}) {
  const style = STATUS_STYLE[req.status] ?? STATUS_STYLE.OPEN!;
  const accentColor = style.color;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full text-left rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform press"
      style={{
        borderColor: req.isPendingMyApproval
          ? "var(--color-signal)"
          : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="p-2.5 flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-m-caption font-mono font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {req.requestNumber}
          </span>
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
            style={{ backgroundColor: accentColor, color: "var(--color-paper)" }}
          >
            {style.label}
          </span>
        </div>
        <p
          className="text-m-body font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {req.title}
        </p>
        <span
          className="text-m-caption truncate"
          style={{ color: "var(--color-ink-500)" }}
        >
          {req.projectName ?? "No project"} · {req.submittedByName}
        </span>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="text-m-caption font-bold tabular-nums px-1.5 py-0.5 rounded-[0.25rem]"
              style={{
                backgroundColor: req.quotesMet
                  ? "var(--color-go-wash)"
                  : "var(--color-concrete)",
                color: req.quotesMet
                  ? "var(--color-go)"
                  : "var(--color-ink-500)",
              }}
            >
              {req.quoteCount}/{req.minQuotesRequired} quotes
            </span>
            {req.isPendingMyApproval ? (
              <span
                className="text-m-caption font-bold px-1.5 py-0.5 rounded-[0.25rem]"
                style={{
                  backgroundColor: "var(--color-signal-wash)",
                  color: "var(--color-signal-dark)",
                }}
              >
                Your approval
              </span>
            ) : null}
            {req.convertedPo ? (
              <span
                className="flex items-center gap-0.5 text-m-caption font-bold"
                style={{ color: "var(--color-go)" }}
              >
                <Trophy className="size-2.5" /> {req.convertedPo.poNumber}
              </span>
            ) : req.selectedQuoteId ? (
              <span
                className="flex items-center gap-0.5 text-m-caption font-bold"
                style={{ color: "var(--color-go)" }}
              >
                <Trophy className="size-2.5" /> Winner
              </span>
            ) : null}
          </div>
          {req.cheapestLandedTotal != null ? (
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: "var(--color-ink-700)" }}
            >
              {formatCurrencyCompact(req.cheapestLandedTotal)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center pr-2 shrink-0">
        <ChevronRight
          className="size-4"
          style={{ color: "var(--color-ink-300)" }}
        />
      </div>
    </button>
  );
}

function QuotationAnalysisOverlay({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [payload, setPayload] = useState<{
    request: Parameters<typeof MobileQuotationDetail>[0]["request"];
    lines: Parameters<typeof MobileQuotationDetail>[0]["lines"];
    quotes: Parameters<typeof MobileQuotationDetail>[0]["quotes"];
    suppliers: Parameters<typeof MobileQuotationDetail>[0]["suppliers"];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setError(null);
    fetch(`/api/quotations/${id}?embed=1`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load quotation");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setPayload({
          request: {
            id: data.id,
            requestNumber: data.requestNumber,
            title: data.title,
            status: data.status,
            minQuotesRequired: data.minQuotesRequired,
            notes: data.notes,
            projectName: data.projectName,
            requiredByDate: data.requiredByDate ?? null,
            workActivity: data.workActivity ?? null,
            submittedByName: data.submittedByName,
            approvedByName: data.approvedByName,
            approvedAt: data.approvedAt,
            approvalReason: data.approvalReason,
            selectedQuoteId: data.selectedQuoteId,
            createdAt: data.createdAt,
            canApprove: data.canApprove ?? false,
            canAddQuote: data.canAddQuote ?? false,
            cheapestQuoteId: data.cheapestQuoteId,
            convertedPo: data.convertedPo ?? null,
            isUrgent: data.isUrgent ?? false,
            daysUntilRequired: data.daysUntilRequired ?? null,
          },
          lines: (data.materials ?? []).map(
            (m: {
              materialId: string;
              materialName: string;
              materialCode: string;
              unit: string;
              qtyRequired: number;
              hsnCode: string | null;
              gstRate: number;
              lastRate: {
                unitCost: number;
                poNumber: string;
                poDate: string;
                supplierName: string;
                projectName: string | null;
              } | null;
              allQuotesAboveLastRate: boolean;
              minVariancePct: number | null;
            }) => ({
              id: m.materialId,
              materialId: m.materialId,
              materialName: m.materialName,
              materialCode: m.materialCode,
              unit: m.unit,
              qtyRequired: m.qtyRequired,
              hsnCode: m.hsnCode,
              gstRate: m.gstRate,
              lastRate: m.lastRate ?? null,
              allQuotesAboveLastRate: m.allQuotesAboveLastRate ?? false,
              minVariancePct: m.minVariancePct ?? null,
            }),
          ),
          quotes: (data.quotes ?? []).map(
            (q: {
              id: string;
              supplierId: string;
              supplierName: string;
              supplierPhone: string | null;
              supplierGstin: string | null;
              fileUrl: string | null;
              fileName: string | null;
              quoteSource: string;
              sourceNote: string | null;
              isCheapest: boolean;
              isSelected: boolean;
              subtotal: number;
              gstTotal: number;
              freightTotal: number;
              handlingTotal: number;
              discountTotal: number;
              packingTotal: number;
              loadingTotal: number;
              insuranceTotal: number;
              landedTotal: number;
              buyerTransportTotal: number;
              validUntil: string | null;
              paymentTerms: string | null;
              deliveryTerms: string | null;
              deliveryTermsType:
                | "DELIVERED_SITE"
                | "EX_WORKS"
                | "FOR_STATION"
                | "CUSTOM"
                | null;
              leadTimeDays: number | null;
              warranty: string | null;
              notes: string | null;
              createdAt: string;
              isExpired: boolean;
              daysUntilExpiry: number | null;
            }) => ({
              ...q,
              deliveryTermsType: q.deliveryTermsType ?? "DELIVERED_SITE",
              status: q.isSelected ? "SELECTED" : "PENDING",
              lines: (data.materials ?? [])
                .map(
                  (m: {
                    materialId: string;
                    hsnCode: string | null;
                    quotes: Array<{
                      quoteId: string;
                      qty: number;
                      unitPrice: number;
                      gstRate: number;
                      gstAmount: number;
                      discountPerUnit: number;
                      packingPerUnit: number;
                      freightPerUnit: number;
                      loadingPerUnit: number;
                      insurancePerUnit: number;
                      handlingPerUnit: number;
                      buyerTransportPerUnit: number;
                      taxableValuePerUnit: number;
                      unitLandedCost: number;
                      lineSubtotal: number;
                      lineTotal: number;
                    }>;
                  }) => {
                    const line = m.quotes.find((l) => l.quoteId === q.id);
                    if (!line) return null;
                    return {
                      materialId: m.materialId,
                      qty: line.qty,
                      unitPrice: line.unitPrice,
                      hsnCode: m.hsnCode ?? null,
                      gstRate: line.gstRate,
                      gstAmount: line.gstAmount,
                      discountPerUnit: line.discountPerUnit,
                      packingPerUnit: line.packingPerUnit,
                      freightPerUnit: line.freightPerUnit,
                      loadingPerUnit: line.loadingPerUnit,
                      insurancePerUnit: line.insurancePerUnit,
                      handlingPerUnit: line.handlingPerUnit,
                      buyerTransportPerUnit: line.buyerTransportPerUnit ?? 0,
                      taxableValuePerUnit: line.taxableValuePerUnit,
                      unitLandedCost: line.unitLandedCost,
                      lineSubtotal: line.lineSubtotal,
                      lineTotal: line.lineTotal,
                    };
                  },
                )
                .filter(Boolean),
            }),
          ),
          suppliers: data.suppliers ?? [],
        });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto p-3.5"
      style={{ backgroundColor: "var(--color-paper)" }}
    >
      {!payload && !error ? (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className="size-5 animate-spin"
            style={{ color: "var(--color-ink-500)" }}
          />
        </div>
      ) : error ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onClose}
            className="p-1 press"
            style={{ color: "var(--color-ink-700)" }}
          >
            <X className="size-5" />
          </button>
          <p
            className="text-m-section font-semibold"
            style={{ color: "var(--color-stop)" }}
          >
            {error}
          </p>
        </div>
      ) : payload ? (
        <MobileQuotationDetail
          request={payload.request}
          lines={payload.lines}
          quotes={payload.quotes}
          suppliers={payload.suppliers}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}
