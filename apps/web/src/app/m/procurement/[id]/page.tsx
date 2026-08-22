import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  ScanLine, Truck, AlertTriangle,
  Building2, IndianRupee, ClipboardList,
} from "lucide-react";
import { getCompany, getCompanyGroupIds, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobilePoActions } from "@/components/mobile/mobile-po-actions";
import { MobileDetailActions } from "@/components/mobile/mobile-detail-actions";
import { MobileReceiveDialog } from "./MobileReceiveDialog";

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
  const groupCompanyIds = await getCompanyGroupIds(company);
  const role = await getUserRole();
  const { id } = await params;

  // Show POs from the entire company group — quotation-approved POs may
  // be created in a different company (parent/child) than the user's current.
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: { in: groupCompanyIds } },
    include: {
      supplier: { select: { name: true, phone: true, gstin: true } },
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true, lat: true, lng: true, geoRadius: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      selectedQuote: { select: { deliveryTermsType: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true, hsnCode: true, gstRate: true, baseUnit: true, secondaryUnit: true, uomConversionFactor: true } } },
        orderBy: { material: { name: "asc" } },
      },
      charges: { orderBy: { createdAt: "asc" } },
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
    hsnCode: l.material.hsnCode,
    gstRate: toNum(l.material.gstRate),
    qtyOrdered: toNum(l.qtyOrdered),
    qtyReceived: toNum(l.qtyReceived),
    unitCost: toNum(l.unitCost),
    lineTotal: toNum(l.lineTotal),
    remaining: toNum(l.qtyOrdered) - toNum(l.qtyReceived),
    baseUnit: l.material.baseUnit,
    secondaryUnit: l.material.secondaryUnit,
    uomConversionFactor: l.material.uomConversionFactor ? Number(l.material.uomConversionFactor) : null,
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
    rejectedAt: po.rejectedAt?.toISOString() ?? null,
    rejectionReason: po.rejectionReason,
    subtotal: toNum(po.subtotal),
    gstTotal: toNum(po.gstTotal),
    freightTotal: toNum(po.freightTotal),
    loadingTotal: toNum(po.loadingTotal),
    packingTotal: toNum(po.packingTotal),
    insuranceTotal: toNum(po.insuranceTotal),
    discountTotal: toNum(po.discountTotal),
    miscChargesTotal: toNum(po.miscChargesTotal),
    total: toNum(po.total),
    notes: po.notes,
  };

  const charges = po.charges.map((c) => ({
    id: c.id,
    heading: c.heading,
    amount: toNum(c.amount),
    notes: c.notes,
  }));

  const freightTotal = toNum(po.freightTotal);
  const loadingTotal = toNum(po.loadingTotal);
  const packingTotal = toNum(po.packingTotal);
  const insuranceTotal = toNum(po.insuranceTotal);
  const discountTotal = toNum(po.discountTotal);
  const miscChargesTotal = toNum(po.miscChargesTotal);
  const hasCharges = freightTotal > 0 || loadingTotal > 0 || packingTotal > 0 || insuranceTotal > 0 || discountTotal > 0 || miscChargesTotal > 0 || charges.length > 0;

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

        {/* Rejection banner — shown if a delivery was rejected */}
        {po.rejectedAt ? (
          <div
            className="rounded-[0.5rem] border p-2.5 mb-2"
            style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)" }}
          >
            <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-stop)" }}>
              Delivery Rejected
            </p>
            <p className="text-[0.5625rem] mt-0.5" style={{ color: "var(--color-ink-700)" }}>
              {po.rejectionReason ?? "No reason provided"}
            </p>
            <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {new Date(po.rejectedAt).toLocaleString("en-IN")}
            </p>
          </div>
        ) : null}

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

      {/* ── Tracking timeline — vertical Amazon-style status tracker ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-steel)" }}>
          Tracking
        </p>
        <div className="relative pl-6">
          {/* Vertical connector line */}
          <div
            className="absolute left-[7px] top-1 bottom-1 w-px"
            style={{ backgroundColor: "var(--color-line)" }}
          />

          {po.status === "CANCELLED" ? (
            <>
              <TimelineStep
                done
                color="var(--color-go)"
                label="Created"
                date={formatDate(po.createdAt)}
                detail={po.createdBy?.name ?? "—"}
              />
              <TimelineStep
                done
                color="var(--color-stop)"
                label="Cancelled"
                detail="Purchase order was cancelled"
              />
            </>
          ) : (
            <>
              {/* Step 1 — Created */}
              <TimelineStep
                done
                color="var(--color-go)"
                label="Created"
                date={formatDate(po.createdAt)}
                detail={po.createdBy?.name ?? "—"}
              />

              {/* Step 2 — Approved */}
              {po.status === "DRAFT" ? (
                <TimelineStep
                  color="var(--color-signal)"
                  label="Awaiting approval"
                  detail={canApprove ? "Your action needed" : "Pending approver review"}
                />
              ) : (
                <TimelineStep
                  done
                  color="var(--color-go)"
                  label="Approved"
                  date={po.approvedAt ? formatDate(po.approvedAt) : undefined}
                  detail={po.approvedBy?.name ?? undefined}
                />
              )}

              {/* Step 3 — Ordered */}
              {po.status === "APPROVED" ? (
                <TimelineStep
                  color="var(--color-signal)"
                  label="Ready to order"
                  detail={canManage ? "Send to supplier" : "Awaiting order placement"}
                />
              ) : po.status === "ORDERED" || po.status === "PARTIAL" || po.status === "RECEIVED" ? (
                <TimelineStep
                  done
                  color="var(--color-go)"
                  label="Ordered"
                  date={po.orderDate ? formatDate(po.orderDate) : undefined}
                  detail="Sent to supplier"
                />
              ) : null}

              {/* Step 4 — Receiving (PARTIAL) */}
              {po.status === "PARTIAL" ? (
                <TimelineStep
                  done
                  color="var(--color-signal)"
                  label="Partially received"
                  date={receipts[0]?.receiptDate ? formatDate(receipts[0].receiptDate) : undefined}
                  detail={`${formatNumber(totalQtyReceived, 0)}/${formatNumber(totalQtyOrdered, 0)} units · ${pendingLines} pending`}
                />
              ) : po.status === "ORDERED" ? (
                <TimelineStep
                  color="var(--color-signal)"
                  label="Awaiting delivery"
                  detail={isReceivable && canReceive ? "Ready to receive materials" : "Waiting for supplier delivery"}
                />
              ) : null}

              {/* Step 5 — Received (complete) */}
              {po.status === "RECEIVED" ? (
                <TimelineStep
                  done
                  color="var(--color-go)"
                  label="Received"
                  date={receipts[0]?.receiptDate ? formatDate(receipts[0].receiptDate) : undefined}
                  detail="All items delivered"
                />
              ) : po.status === "PARTIAL" ? (
                <TimelineStep
                  color="var(--color-steel)"
                  label="Fully received"
                  detail="Waiting for remaining items"
                />
              ) : null}
            </>
          )}
        </div>
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
            {freightTotal > 0 ? <KpiRow label="Freight" value={formatCurrency(freightTotal)} /> : null}
            {loadingTotal > 0 ? <KpiRow label="Loading" value={formatCurrency(loadingTotal)} /> : null}
            {packingTotal > 0 ? <KpiRow label="Packing" value={formatCurrency(packingTotal)} /> : null}
            {insuranceTotal > 0 ? <KpiRow label="Insurance" value={formatCurrency(insuranceTotal)} /> : null}
            {discountTotal > 0 ? <KpiRow label="Discount" value={`−${formatCurrency(discountTotal)}`} tone="go" /> : null}
            {miscChargesTotal > 0 ? <KpiRow label="Misc" value={formatCurrency(miscChargesTotal)} /> : null}
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
          <MobileReceiveDialog
            poId={po.id}
            poNumber={po.poNumber}
            supplierId={po.supplierId}
            supplierName={po.supplier.name}
            locationId={po.destinationLocation.id}
            locationName={po.destinationLocation.name}
            locationLat={po.destinationLocation.lat ? Number(po.destinationLocation.lat) : null}
            locationLng={po.destinationLocation.lng ? Number(po.destinationLocation.lng) : null}
            locationGeoRadius={po.destinationLocation.geoRadius ? Number(po.destinationLocation.geoRadius) : null}
            deliveryTermsType={po.selectedQuote?.deliveryTermsType ?? undefined}
            lines={lines.map((l) => ({
              id: l.id,
              materialId: l.materialId,
              materialName: l.materialName,
              materialCode: l.materialCode,
              unit: l.unit,
              hsnCode: l.hsnCode,
              gstRate: l.gstRate,
              qtyOrdered: l.qtyOrdered,
              qtyReceived: l.qtyReceived,
              unitCost: l.unitCost,
              baseUnit: l.baseUnit,
              secondaryUnit: l.secondaryUnit,
              uomConversionFactor: l.uomConversionFactor,
            }))}
          />
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
                  <a
                    href={`/print/goods-receipt/${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[0.4375rem] font-semibold rounded px-1.5 py-0.5"
                    style={{ color: "var(--color-ink-700)", backgroundColor: "var(--color-paper-2)" }}
                  >
                    Print GRN
                  </a>
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

      {/* ── Itemized charges (from quotation or manual) ── */}
      {hasCharges ? (
        <div className="mb-3">
          <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Charges & Freight
          </h3>
          <div className="flex flex-col gap-1.5">
            {charges.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-[0.5rem] border px-2.5 py-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {c.heading}
                  </p>
                  {c.notes ? (
                    <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>{c.notes}</p>
                  ) : null}
                </div>
                <span className="text-[0.6875rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-steel)" }}>
                  {formatCurrency(c.amount)}
                </span>
              </div>
            ))}
            {/* Show auto-computed header charges that aren't itemized */}
            {freightTotal > 0 && !charges.some((c) => c.heading.includes("Freight")) ? (
              <ChargeRow heading="Freight / Transportation" amount={freightTotal} />
            ) : null}
            {loadingTotal > 0 && !charges.some((c) => c.heading.includes("Loading")) ? (
              <ChargeRow heading="Loading / Unloading" amount={loadingTotal} />
            ) : null}
            {packingTotal > 0 && !charges.some((c) => c.heading.includes("Packing")) ? (
              <ChargeRow heading="Packing & Forwarding" amount={packingTotal} />
            ) : null}
            {insuranceTotal > 0 && !charges.some((c) => c.heading.includes("Insurance")) ? (
              <ChargeRow heading="Transit Insurance" amount={insuranceTotal} />
            ) : null}
          </div>
        </div>
      ) : null}

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
function ChargeRow({ heading, amount }: { heading: string; amount: number }) {
  return (
    <div
      className="flex items-center justify-between rounded-[0.5rem] border px-2.5 py-2"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
    >
      <p className="text-[0.625rem] font-semibold truncate" style={{ color: "var(--color-ink-700)" }}>
        {heading}
      </p>
      <span className="text-[0.6875rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-steel)" }}>
        {formatCurrency(amount)}
      </span>
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

/* ── Timeline step — vertical tracking dot + content ── */
function TimelineStep({
  done,
  color,
  label,
  date,
  detail,
}: {
  done?: boolean;
  color: string;
  label: string;
  date?: string;
  detail?: React.ReactNode;
}) {
  return (
    <div className="relative pb-4 last:pb-0">
      {/* Dot */}
      <div
        className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2"
        style={{
          backgroundColor: done ? color : "var(--color-paper)",
          borderColor: color,
        }}
      >
        {done ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-1 h-1 rounded-full bg-white" />
          </div>
        ) : null}
      </div>
      {/* Content */}
      <div>
        <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        {date ? (
          <p className="text-[0.5625rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {date}
          </p>
        ) : null}
        {detail ? (
          <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
