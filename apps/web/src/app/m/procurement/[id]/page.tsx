import Link from "next/link";
import { prisma } from "@nirman/db";
import {
  ScanLine, Truck,
  Building2, IndianRupee, ClipboardList, Printer,
} from "lucide-react";
import { getCompanyGroupIds, getCurrentUser, getUserPermissions, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobilePipelineStepper,
  type MobilePipelineStep,
} from "@/components/mobile/v2/primitives";
import {
  DetailHeroCard,
  DetailProgress,
  DetailAlertBanner,
  DetailTimeline,
  DetailLinkRow,
  DetailPrintButton,
  type TimelineStepData,
} from "@/components/mobile/v2/detail-primitives";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { resolveNextAction } from "@/lib/flow-map";
import { MobilePoActions } from "@/components/mobile/mobile-po-actions";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
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
    <MobileDetailPage params={params} managePerm={PERM.PROCUREMENT_MANAGE} skeletonSections={6}>
      {async ({ id, company, role, canManage }) => {
        const groupCompanyIds = await getCompanyGroupIds(company);
        const overrides = await getUserPermissions();

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
              include: { material: { select: { id: true, code: true, name: true, unit: true, hsnCode: true, gstRate: true, baseUnit: true, secondaryUnit: true, uomConversionFactor: true, isLotTracked: true } } },
              orderBy: { material: { name: "asc" } },
            },
            charges: { orderBy: { createdAt: "asc" } },
            goodsReceipts: {
              include: { lines: { select: { qtyReceived: true } } },
              orderBy: { receiptDate: "desc" },
            },
            supplierPayments: {
              orderBy: { paymentDate: "desc" },
              select: {
                id: true, paymentNumber: true, amount: true,
                tdsAmount: true, tdsSection: true, netPaidAmount: true,
                paymentDate: true, paymentMode: true, referenceNo: true,
              },
            },
          },
        });

        // Look up the source requisition (if this PO was converted from one)
        const sourceRequisition = po ? await prisma.materialRequisition.findFirst({
          where: { convertedPoId: po.id },
          select: { id: true, reqNumber: true },
        }) : null;

        if (!po) {
          return (
            <div>
              <div className="mb-4">
              </div>
              <MobileEmptyState icon={ScanLine} title="PO not found" />
            </div>
          );
        }

        const canApprove = hasPermission(role, PERM.PO_APPROVE) && po.createdById !== (await getCurrentUser())?.id;
        const canManagePayments = hasPermission(role, PERM.FINANCE_MANAGE);
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
          isLotTracked: l.material.isLotTracked,
        }));

        const receipts = po.goodsReceipts.map((gr) => ({
          id: gr.id,
          receiptDate: gr.receiptDate.toISOString(),
          inspectionStatus: gr.inspectionStatus,
          qty: gr.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0),
        }));

        const payments = po.supplierPayments.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          amount: toNum(p.amount),
          tdsAmount: toNum(p.tdsAmount),
          tdsSection: p.tdsSection,
          netPaidAmount: toNum(p.netPaidAmount),
          paymentDate: p.paymentDate.toISOString(),
          paymentMode: p.paymentMode,
          referenceNo: p.referenceNo,
        }));
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

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
          approvedAt: po.approvedAt?.toISOString() ?? null,
          approvedByName: po.approvedBy?.name ?? null,
          approvalNotes: po.approvalNotes,
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

        // Overdue calculation for inline alert
        // eslint-disable-next-line react-hooks/purity -- server component
        const now = Date.now();
        let overdueDays = 0;
        if (po.status === "ORDERED" && po.expectedDate) {
          overdueDays = Math.floor((now - new Date(po.expectedDate).getTime()) / (1000 * 60 * 60 * 24));
        }

        // Pipeline position: Indent → Quote → PO → GRN → Issue
        const pipelineSteps: MobilePipelineStep[] = [
          {
            label: "Indent",
            state: sourceRequisition ? "done" : "skipped",
            href: sourceRequisition ? `/m/requisitions/${sourceRequisition.id}` : undefined,
          },
          { label: "Quote", state: sourceRequisition ? "done" : "skipped" },
          { label: "PO", state: "current" },
          {
            label: "GRN",
            state: po.goodsReceipts.length > 0 ? "done" : "pending",
          },
          { label: "Issue", state: "pending" },
        ];

        // Tracking timeline — built from the PO's status + role permissions.
        // Maps the previous hand-rolled <TimelineStep> conditionals onto the
        // shared DetailTimeline's TimelineStepData[] model.
        const timelineSteps: TimelineStepData[] = [];
        if (po.status === "CANCELLED") {
          timelineSteps.push(
            { label: "Created", date: formatDate(po.createdAt), detail: po.createdBy?.name ?? "—", state: "done", color: "var(--color-go)" },
            { label: "Cancelled", detail: "Purchase order was cancelled", state: "done", color: "var(--color-stop)" },
          );
        } else {
          // Step 1 — Created
          timelineSteps.push(
            { label: "Created", date: formatDate(po.createdAt), detail: po.createdBy?.name ?? "—", state: "done", color: "var(--color-go)" },
          );

          // Step 2 — Approved
          if (po.status === "DRAFT") {
            timelineSteps.push({
              label: "Awaiting approval",
              detail: canApprove ? "Your action needed" : "Pending approver review",
              state: "current",
            });
          } else {
            timelineSteps.push({
              label: "Approved",
              date: po.approvedAt ? formatDate(po.approvedAt) : undefined,
              detail: po.approvedBy?.name ?? undefined,
              state: "done",
              color: "var(--color-go)",
            });
          }

          // Step 3 — Ordered
          if (po.status === "APPROVED") {
            timelineSteps.push({
              label: "Ready to order",
              detail: canManage ? "Send to supplier" : "Awaiting order placement",
              state: "current",
            });
          } else if (po.status === "ORDERED" || po.status === "PARTIAL" || po.status === "RECEIVED") {
            timelineSteps.push({
              label: "Ordered",
              date: po.orderDate ? formatDate(po.orderDate) : undefined,
              detail: "Sent to supplier",
              state: "done",
              color: "var(--color-go)",
            });
          }

          // Step 4 — Receiving (PARTIAL)
          if (po.status === "PARTIAL") {
            timelineSteps.push({
              label: "Partially received",
              date: receipts[0]?.receiptDate ? formatDate(receipts[0].receiptDate) : undefined,
              detail: `${formatNumber(totalQtyReceived, 0)}/${formatNumber(totalQtyOrdered, 0)} units · ${pendingLines} pending`,
              state: "done",
              color: "var(--color-signal)",
            });
          } else if (po.status === "ORDERED") {
            timelineSteps.push({
              label: "Awaiting delivery",
              detail: isReceivable && canReceive ? "Ready to receive materials" : "Waiting for supplier delivery",
              state: "current",
            });
          }

          // Step 5 — Received (complete)
          if (po.status === "RECEIVED") {
            timelineSteps.push({
              label: "Received",
              date: receipts[0]?.receiptDate ? formatDate(receipts[0].receiptDate) : undefined,
              detail: "All items delivered",
              state: "done",
              color: "var(--color-go)",
            });
          } else if (po.status === "PARTIAL") {
            timelineSteps.push({
              label: "Fully received",
              detail: "Waiting for remaining items",
              state: "pending",
            });
          }
        }

        // Resolve the next action for this PO's status + the viewer's role.
        // Server-side — no permission function crosses the boundary.
        const nextAction = resolveNextAction("procurement", po.status, role, overrides);

        // Permissions to announce to the NavSheet's Next Step resolver
        const canActions: string[] = [];
        if (canApprove) canActions.push(PERM.PO_APPROVE);
        if (canManage) canActions.push(PERM.PROCUREMENT_MANAGE);
        if (canReceive) canActions.push(PERM.PROCUREMENT_VIEW);
        if (canManagePayments) canActions.push(PERM.FINANCE_MANAGE);

        return (
          <PageContextProvider value={{
            entityType: "purchaseOrder",
            flowId: "procurement",
            status: po.status,
            label: po.poNumber,
            subtitle: po.supplier.name,
            recordId: po.id,
            canActions,
          }}>
          <div className="pb-20">
            <RecordRecentItem type="po" id={po.id} label={po.poNumber} sublabel={po.supplier.name} href={`/m/procurement/${po.id}`} />

            {/* ── Next action — the one thing to do, doable on this page ── */}
            {nextAction ? (
              <NextActionCardView
                label={nextAction.label}
                reason={nextAction.reason}
                tone={nextAction.tone ?? "signal"}
                hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
                href={nextAction.action.type === "navigate" ? nextAction.action.href.replace("{id}", po.id) : undefined}
              />
            ) : null}

            {/* ── Hero card — identity + receive progress ── */}
            <DetailHeroCard
              icon={Truck}
              title={po.poNumber}
              titleMono
              subtitle={po.supplier.name}
              subtitleHref={`/m/suppliers/${po.supplierId}`}
              status={po.status}
              action={<DetailPrintButton href={`/print/purchase-order/${po.id}`} />}
            >
              {/* Rejection banner — shown if a delivery was rejected */}
              {po.rejectedAt ? (
                <DetailAlertBanner
                  tone="danger"
                  title="Delivery Rejected"
                  description={po.rejectionReason ?? "No reason provided"}
                >
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                    {new Date(po.rejectedAt).toLocaleString("en-IN")}
                  </p>
                </DetailAlertBanner>
              ) : null}

              {/* Project link (only if project-scoped) */}
              {po.project ? (
                <DetailLinkRow
                  href={`/m/projects/${po.project.id}`}
                  icon={Building2}
                  label={po.project.name}
                />
              ) : null}

              {/* Source requisition link (if PO was converted from a requisition) */}
              {sourceRequisition ? (
                <DetailLinkRow
                  href={`/m/requisitions/${sourceRequisition.id}`}
                  icon={ClipboardList}
                  label={`From indent ${sourceRequisition.reqNumber}`}
                />
              ) : null}

              {/* Inline overdue alert */}
              {overdueDays > 0 ? (
                <DetailAlertBanner
                  tone="danger"
                  title={`Overdue by ${overdueDays} day${overdueDays !== 1 ? "s" : ""}`}
                />
              ) : null}

              {/* Pipeline position — where this PO sits in the flow */}
              <div className="mt-2.5">
                <MobilePipelineStepper steps={pipelineSteps} />
              </div>

              {/* Receive progress bar — the key visual */}
              {totalQtyOrdered > 0 ? (
                <DetailProgress
                  label="Received"
                  value={`${formatNumber(totalQtyReceived, 0)}/${formatNumber(totalQtyOrdered, 0)} units`}
                  pct={receivePct}
                  hint={`${Math.round(receivePct)}%${pendingLines > 0 ? ` · ${pendingLines} pending` : ""}`}
                />
              ) : null}
            </DetailHeroCard>

            {/* ── Tracking timeline — vertical Amazon-style status tracker ── */}
            <DetailTimeline steps={timelineSteps} title="Tracking" />

            {/* Approval notes banner */}
            {po.approvedAt && po.approvalNotes ? (
              <DetailAlertBanner
                tone="success"
                title="Approval Notes"
                description={po.approvalNotes}
              >
                {po.approvedBy?.name ? (
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                    — {po.approvedBy.name} · {formatDate(po.approvedAt)}
                  </p>
                ) : null}
              </DetailAlertBanner>
            ) : null}

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
                  <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>Financials</p>
                </div>
                <div className="space-y-1.5">
                  <KpiRow label="Total" value={formatCurrencyCompact(total)} />
                  <KpiRow label="Subtotal" value={formatCurrencyCompact(subtotal)} />
                  <KpiRow label="GST" value={formatCurrencyCompact(gstTotal)} />
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
                  <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>Logistics</p>
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
                    isLotTracked: l.isLotTracked,
                  }))}
                />
              </div>
            ) : null}

            {/* ── Lines + Receipts — 2-col side by side, each stacking vertically ── */}
            <div className="grid grid-cols-2 gap-2 mb-3 items-start">
              {/* Lines column */}
              <div className="flex flex-col gap-1.5">
                <h3 className="text-m-body font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                  Lines ({lines.length})
                </h3>
                {lines.map((l) => {
                  const linePct = l.qtyOrdered > 0 ? (l.qtyReceived / l.qtyOrdered) * 100 : 0;
                  const lineTone = linePct >= 100 ? "var(--color-go)" : linePct > 0 ? "var(--color-signal)" : "var(--color-ink-500)";
                  return (
                    <Link
                      key={l.id}
                      href={`/m/materials/${l.materialId}`}
                      className="flex flex-col rounded-[0.5rem] border p-2 text-m-body press overflow-hidden"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                    >
                      <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: lineTone }} />
                      <p className="text-m-caption font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                        {l.materialName}
                      </p>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                          {formatNumber(l.qtyReceived, 0)}/{formatNumber(l.qtyOrdered, 0)} {l.unit}
                        </span>
                        <span className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                          @ {formatCurrency(l.unitCost)}
                        </span>
                      </div>
                      <div className="h-0.5 rounded-full overflow-hidden mb-1" style={{ backgroundColor: "var(--color-concrete)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, linePct)}%`, backgroundColor: lineTone }} />
                      </div>
                      <p className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                        {formatCurrency(l.lineTotal)}
                      </p>
                    </Link>
                  );
                })}
              </div>

              {/* Receipts column */}
              <div className="flex flex-col gap-1.5">
                <h3 className="text-m-body font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
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
                        <p className="text-m-caption font-bold leading-tight mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                          {formatDate(r.receiptDate)}
                        </p>
                        <p className="text-m-caption mb-1 uppercase font-semibold" style={{ color: inspTone }}>
                          {r.inspectionStatus}
                        </p>
                        <p className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                          {formatNumber(r.qty, 0)} units
                        </p>
                        <a
                          href={`/print/goods-receipt/${r.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-m-caption font-semibold rounded px-1.5 py-0.5"
                          style={{ color: "var(--color-ink-700)", backgroundColor: "var(--color-paper-2)" }}
                        >
                          Print GRN
                        </a>
                      </div>
                    );
                  })
                ) : (
                  <MobileEmptyState
                    icon={ScanLine}
                    title="No receipts yet"
                    size="compact"
                  />
                )}
              </div>
            </div>

            {/* ── Itemized charges (from quotation or manual) ── */}
            {hasCharges ? (
              <div className="mb-3">
                <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
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
                        <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                          {c.heading}
                        </p>
                        {c.notes ? (
                          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{c.notes}</p>
                        ) : null}
                      </div>
                      <span className="text-m-body font-bold tabular-nums shrink-0" style={{ color: "var(--color-steel)" }}>
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

            {/* ── Payments ── */}
            {payments.length > 0 ? (
              <div className="mb-3">
                <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
                  Payments ({payments.length})
                </h3>
                <div className="flex flex-col gap-1.5">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-[0.5rem] border px-2.5 py-2"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                    >
                      <div className="min-w-0">
                        <a
                          href={`/print/supplier-payment/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-m-label font-bold truncate inline-flex items-center gap-1 text-m-body press"
                          style={{ color: "var(--color-brand)" }}
                        >
                          {p.paymentNumber}
                          <Printer className="size-2.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                        </a>
                        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                          {formatDate(p.paymentDate)} · {p.paymentMode}
                          {p.referenceNo ? ` · ${p.referenceNo}` : ""}
                        </p>
                        {p.tdsAmount > 0 ? (
                          <p className="text-m-caption truncate" style={{ color: "var(--color-signal)" }}>
                            TDS: {formatCurrency(p.tdsAmount)}{p.tdsSection ? ` (${p.tdsSection})` : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-m-body font-bold tabular-nums block" style={{ color: "var(--color-steel)" }}>
                          {formatCurrency(p.amount)}
                        </span>
                        {p.tdsAmount > 0 ? (
                          <span className="text-m-caption tabular-nums block" style={{ color: "var(--color-go)" }}>
                            Net: {formatCurrency(p.netPaidAmount)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {/* Payment summary */}
                  <div
                    className="flex items-center justify-between rounded-[0.5rem] border px-2.5 py-2"
                    style={{ borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-concrete)" }}
                  >
                    <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>
                      Total Paid
                    </p>
                    <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrencyCompact(totalPaid)} / {formatCurrencyCompact(total)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── Inline actions ── */}
            <MobilePoActions
              po={poPayload}
              canApprove={canApprove}
              canManage={canManage}
              canManagePayments={canManagePayments}
              supplierId={po.supplierId}
              supplierName={po.supplier.name}
              balanceRemaining={Math.max(0, poPayload.total - totalPaid)}
              backHref="/m/procurement"
            />
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}

/* ─── Charge row ─── */
function ChargeRow({ heading, amount }: { heading: string; amount: number }) {
  return (
    <div
      className="flex items-center justify-between rounded-[0.5rem] border px-2.5 py-2"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
    >
      <p className="text-m-label font-semibold truncate" style={{ color: "var(--color-ink-700)" }}>
        {heading}
      </p>
      <span className="text-m-body font-bold tabular-nums shrink-0" style={{ color: "var(--color-steel)" }}>
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
      <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-m-caption font-bold text-right tabular-nums truncate" style={{ color }}>
        {value}
        {sub ? <span className="font-normal ml-0.5" style={{ color: "var(--color-ink-500)" }}>{sub}</span> : null}
      </span>
    </div>
  );
}
