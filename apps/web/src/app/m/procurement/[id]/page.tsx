import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ScanLine, Printer } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileEmptyState,
  MobileCta,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";
import { MobilePoActions } from "@/components/mobile/mobile-po-actions";
import { MobileDetailActions } from "@/components/mobile/mobile-detail-actions";

/**
 * /m/procurement/[id] — PO detail with lines, totals, receipts, and inline
 * approve / order / cancel actions. Receiving is linked to the field scanner
 * (the existing FieldReceive component) which stays inside the mobile shell.
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
        <MobileDetailHeader title="Purchase Order" backHref="/m/procurement" />
        <MobileEmptyState title="PO not found" />
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

  return (
    <div>
      <MobileDetailHeader
        title={po.poNumber}
        subtitle={po.supplier.name}
        backHref="/m/procurement"
        right={<MobileStatusBadge status={po.status} />}
      />

      {/* ── Status + scope ────────────────────────────────────── */}
      <MobileSectionTitle>Summary</MobileSectionTitle>
      <div>
        <MobileInfoRow title="Supplier" value={po.supplier.name} />
        {po.supplier.phone && <MobileInfoRow title="Phone" value={po.supplier.phone} />}
        <MobileInfoRow title="Scope" value={po.procurementScope === "PROJECT" ? "Project" : "Company"} />
        {po.project && (
          <Link
            href={`/m/projects/${po.project.id}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-foreground">Project</div>
            </div>
            <span className="shrink-0 truncate text-body font-semibold text-brand">{po.project.name}</span>
          </Link>
        )}
        <MobileInfoRow title="Receive at" value={po.destinationLocation.name} />
        {po.expectedDate && <MobileInfoRow title="Expected" value={formatDate(po.expectedDate)} />}
        <MobileInfoRow title="Total" value={formatCurrency(toNum(po.total))} />
      </div>

      {/* ── Receive CTA ───────────────────────────────────────── */}
      {isReceivable && canReceive && (
        <div className="px-4 pt-3">
          <MobileCta href={`/m/site/field?po=${po.id}`} icon={ScanLine}>
            Receive materials
          </MobileCta>
        </div>
      )}

      {/* ── Lines ─────────────────────────────────────────────── */}
      <MobileSectionTitle>Lines ({lines.length})</MobileSectionTitle>
      <div>
        {lines.map((l) => (
          <Link
            key={l.id}
            href={`/m/materials/${l.materialId}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-foreground">{l.materialName} · {l.materialCode}</div>
              <div className="truncate text-caption text-muted-foreground">
                {formatNumber(l.qtyOrdered, 0)}/{formatNumber(l.qtyReceived, 0)} {l.unit} @ {formatCurrency(l.unitCost)}
              </div>
            </div>
            <span className="shrink-0 text-body font-semibold tnum text-foreground">{formatCurrency(l.lineTotal)}</span>
          </Link>
        ))}
      </div>

      {/* ── Totals ────────────────────────────────────────────── */}
      <MobileSectionTitle>Totals</MobileSectionTitle>
      <div>
        <MobileInfoRow title="Subtotal" value={formatCurrency(toNum(po.subtotal))} />
        <MobileInfoRow title="GST" value={formatCurrency(toNum(po.gstTotal))} />
        <MobileInfoRow title="Total" value={formatCurrency(toNum(po.total))} />
      </div>

      {/* ── Receipts ──────────────────────────────────────────── */}
      {receipts.length > 0 && (
        <>
          <MobileSectionTitle>Receipts ({receipts.length})</MobileSectionTitle>
          <div>
            {receipts.map((r) => (
              <MobileInfoRow
                key={r.id}
                title={`${formatDate(r.receiptDate)} · ${r.inspectionStatus}`}
                value={`${formatNumber(r.qty, 0)} units`}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Inline actions ────────────────────────────────────── */}
      <MobilePoActions
        po={poPayload}
        canApprove={canApprove}
        canManage={canManage}
        backHref="/m/procurement"
      />

      {/* ── Print ─────────────────────────────────────────────── */}
      <MobileDetailActions
        links={[
          {
            label: "Print Purchase Order",
            icon: Printer,
            href: `/print/purchase-order/${po.id}`,
            variant: "outline",
          },
        ]}
      />
    </div>
  );
}
