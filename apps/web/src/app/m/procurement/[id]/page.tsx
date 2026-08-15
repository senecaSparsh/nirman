import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  ScanLine, Truck, AlertTriangle,
  Building2, IndianRupee, ClipboardList,
} from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobilePoActions } from "@/components/mobile/mobile-po-actions";
import { MobileDetailActions } from "@/components/mobile/mobile-detail-actions";

/**
 * /m/procurement/[id] — PO detail with lines, totals, receipts, and inline
 * approve / order / cancel actions. Receiving is linked to the field scanner.
 */
export default function MobilePoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePoDetailContent params={params} />
    </Suspense>
  );
}

async function MobilePoDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { name: true, phone: true, gstin: true } },
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { name: true, type: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      },
      goodsReceipts: {
        include: { lines: { select: { qtyReceived: true } } },
        orderBy: { receiptDate: "desc" },
      },
    },
  });

  if (!po) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={ScanLine} title="PO not found" />
      </div>
    );
  }

  const canApprove = hasPermission(role, PERM.PO_APPROVE);
  const canManage = hasPermission(role, PERM.PROCUREMENT_MANAGE);
  const canReceive = hasPermission(role, PERM.PROCUREMENT_VIEW);
  const isReceivable = po.status === "ORDERED" || po.status === "PARTIAL";

  const lines = po.lines.map((l) => ({
    id: l.id,
    materialName: l.material.name,
    materialCode: l.material.code,
    materialId: l.material.id,
    unit: l.material.unit,
    qtyOrdered: toNum(l.qtyOrdered),
    qtyReceived: toNum(l.qtyReceived),
    unitCost: toNum(l.unitCost),
    lineTotal: toNum(l.lineTotal),
    remaining: toNum(l.qtyOrdered) - toNum(l.qtyReceived),
  }));

  const receipts = po.goodsReceipts.map((gr) => ({
    id: gr.id,
    receiptDate: gr.receiptDate.toISOString(),
    inspectionStatus: gr.inspectionStatus,
    qty: gr.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0),
  }));

  const poPayload = {
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    supplierName: po.supplier.name,
    procurementScope: po.procurementScope,
    projectId: po.project?.id ?? null,
    projectName: po.project?.name ?? null,
    destinationLocationName: po.destinationLocation.name,
    expectedDate: po.expectedDate?.toISOString() ?? null,
    orderDate: po.orderDate?.toISOString() ?? null,
    subtotal: toNum(po.subtotal),
    gstTotal: toNum(po.gstTotal),
    total: toNum(po.total),
    notes: po.notes,
  };

  // Derived KPIs
  const totalQtyOrdered = lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalQtyReceived = lines.reduce((s, l) => s + l.qtyReceived, 0);
  const receivePct = totalQtyOrdered > 0 ? (totalQtyReceived / totalQtyOrdered) * 100 : 0;
  const pendingLines = lines.filter((l) => l.remaining > 0).length;
  const subtotal = toNum(po.subtotal);
  const gstTotal = toNum(po.gstTotal);
  const total = toNum(po.total);

  const statusTone =
    po.status === "RECEIVED" ? "var(--color-go)" :
    po.status === "CANCELLED" ? "var(--color-stop)" :
    po.status === "DRAFT" ? "var(--color-ink-500)" :
    po.status === "PARTIAL" ? "var(--color-signal)" :
    "var(--color-steel)";

  // Overdue calculation for inline alert
  const now = Date.now();
  let overdueDays = 0;
  if (po.status === "ORDERED" && po.expectedDate) {
    overdueDays = Math.floor((now - new Date(po.expectedDate).getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div>
      {/* ── Back ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
      </div>

      {/* ── Hero card — identity + receive progress ── */}
      <div
        className="rounded-[0.875rem] border p-3.5 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="grid place-items-center w-11 h-11 rounded-[0.625rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Truck className="size-5" style={{ color: "var(--color-ink-700)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-[1.0625rem] leading-tight font-mono" style={{ color: "var(--color-ink-950)" }}>
              {po.poNumber}
            </h1>
            <Link
              href={`/m/suppliers/${po.supplierId}`}
              className="text-[0.6875rem] mt-0.5 underline underline-offset-2 press"
              style={{ color: "var(--color-ink-500)" }}
            >
              {po.supplier.name}
            </Link>
          </div>
          <span
            className="text-[0.4375rem] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: statusTone, color: "#fff" }}
          >
            {po.status}
          </span>
        </div>

        {/* Project link (only if project-scoped) */}
        {po.project ? (
          <Link
            href={`/m/projects/${po.project.id}`}
            className="flex items-center gap-1.5 text-[0.625rem] mt-2.5 press"
            style={{ color: "var(--color-steel)" }}
          >
            <Building2 className="size-3 shrink-0" />
            <span className="truncate underline underline-offset-2">{po.project.name}</span>
          </Link>
        ) : null}

        {/* Inline overdue alert */}
        {overdueDays > 0 ? (
          <div
            className="flex items-center gap-1.5 mt-2.5 rounded-[0.375rem] px-2 py-1 text-[0.5625rem] font-semibold"
            style={{ backgroundColor: "var(--color-stop-wash)", color: "var(--color-stop)" }}
          >
            <AlertTriangle className="size-3 shrink-0" />
            Overdue by {overdueDays} day{overdueDays !== 1 ? "s" : ""}
          </div>
        ) : null}

        {/* Receive progress bar — the key visual */}
        {totalQtyOrdered > 0 ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[0.5625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Received
              </span>
              <span className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatNumber(totalQtyReceived, 0)}/{formatNumber(totalQtyOrdered, 0)} units
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, receivePct)}%`,
                  backgroundColor: receivePct >= 100 ? "var(--color-go)" : receivePct > 0 ? "var(--color-signal)" : "var(--color-steel)",
                }}
              />
            </div>
            <p className="text-[0.5rem] mt-0.5 text-right tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {Math.round(receivePct)}%{pendingLines > 0 ? ` · ${pendingLines} pending` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Financials + Logistics — 2-col grid (no overlap with hero) ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Financials card — money only, not in hero */}
        <div
          className="rounded-[0.625rem] border p-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
              <IndianRupee className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Financials</p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Total" value={formatCurrency(total)} />
            <KpiRow label="Subtotal" value={formatCurrency(subtotal)} />
            <KpiRow label="GST" value={formatCurrency(gstTotal)} />
            <KpiRow label="Avg/line" value={lines.length > 0 ? formatCurrency(total / lines.length) : "—"} />
          </div>
        </div>

        {/* Logistics card — dates + supplier info, not in hero */}
        <div
          className="rounded-[0.625rem] border p-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
              <ClipboardList className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Logistics</p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Recv at" value={po.destinationLocation.name} />
            {po.expectedDate ? <KpiRow label="Expected" value={formatDate(po.expectedDate)} /> : null}
            {po.orderDate ? <KpiRow label="Ordered" value={formatDate(po.orderDate)} /> : null}
            {po.supplier.phone ? <KpiRow label="Phone" value={po.supplier.phone} /> : null}
            {po.supplier.gstin ? <KpiRow label="GSTIN" value={po.supplier.gstin} /> : null}
          </div>
        </div>
      </div>

      {/* ── Receive CTA ── */}
      {isReceivable && canReceive ? (
        <div className="mb-3">
          <MobileCta href={`/m/site/field?po=${po.id}`} icon={ScanLine} variant="primary">
            Receive materials
          </MobileCta>
        </div>
      ) : null}

      {/* ── Lines + Receipts — 2-col side by side, each stacking vertically ── */}
      <div className="grid grid-cols-2 gap-2 mb-3 items-start">
        {/* Lines column */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            Lines ({lines.length})
          </h3>
          {lines.map((l) => {
            const linePct = l.qtyOrdered > 0 ? (l.qtyReceived / l.qtyOrdered) * 100 : 0;
            const lineTone = linePct >= 100 ? "var(--color-go)" : linePct > 0 ? "var(--color-signal)" : "var(--color-ink-500)";
            return (
              <Link
                key={l.id}
                href={`/m/materials/${l.materialId}`}
                className="flex flex-col rounded-[0.5rem] border p-2 press overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: lineTone }} />
                <p className="text-[0.5625rem] font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                  {l.materialName}
                </p>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[0.5rem] font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                    {formatNumber(l.qtyReceived, 0)}/{formatNumber(l.qtyOrdered, 0)} {l.unit}
                  </span>
                  <span className="text-[0.4375rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                    @ {formatCurrency(l.unitCost)}
                  </span>
                </div>
                <div className="h-0.5 rounded-full overflow-hidden mb-1" style={{ backgroundColor: "var(--color-concrete)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, linePct)}%`, backgroundColor: lineTone }} />
                </div>
                <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                  {formatCurrency(l.lineTotal)}
                </p>
              </Link>
            );
          })}
        </div>

        {/* Receipts column */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            Receipts ({receipts.length})
          </h3>
          {receipts.length > 0 ? (
            receipts.map((r) => {
              const inspTone =
                r.inspectionStatus === "PASSED" ? "var(--color-go)" :
                r.inspectionStatus === "FAILED" ? "var(--color-stop)" :
                r.inspectionStatus === "PENDING" ? "var(--color-signal)" :
                "var(--color-ink-500)";
              return (
                <div
                  key={r.id}
                  className="flex flex-col rounded-[0.5rem] border p-2 overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: inspTone }} />
                  <p className="text-[0.5625rem] font-bold leading-tight mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                    {formatDate(r.receiptDate)}
                  </p>
                  <p className="text-[0.4375rem] mb-1 uppercase font-semibold" style={{ color: inspTone }}>
                    {r.inspectionStatus}
                  </p>
                  <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                    {formatNumber(r.qty, 0)} units
                  </p>
                </div>
              );
            })
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-[0.5rem] border p-2 text-center"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", minHeight: "3rem" }}
            >
              <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
                No receipts yet
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Inline actions ── */}
      <MobilePoActions
        po={poPayload}
        canApprove={canApprove}
        canManage={canManage}
        backHref="/m/procurement"
      />

      {/* ── Print ── */}
      <MobileDetailActions
        links={[
          {
            label: "Print Purchase Order",
            icon: "Printer",
            href: `/print/purchase-order/${po.id}`,
            variant: "outline",
          },
        ]}
      />
    </div>
  );
}

/* ─── KPI row ─── */
function KpiRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "go" | "signal" | "stop";
}) {
  const color =
    tone === "go" ? "var(--color-go)" :
    tone === "signal" ? "var(--color-signal-dark)" :
    tone === "stop" ? "var(--color-stop)" :
    "var(--color-ink-950)";
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-[0.5rem] shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-[0.5625rem] font-bold text-right tabular-nums truncate" style={{ color }}>
        {value}
        {sub ? <span className="font-normal ml-0.5" style={{ color: "var(--color-ink-500)" }}>{sub}</span> : null}
      </span>
    </div>
  );
}
