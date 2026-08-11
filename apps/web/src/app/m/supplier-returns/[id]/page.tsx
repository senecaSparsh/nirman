import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Undo2, FileText, Building2, MapPin } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";
import { MobileDetailActions } from "@/components/mobile/mobile-detail-actions";

/**
 * /m/supplier-returns/[id] — supplier return detail. Shows the
 * return header, line items with reasons, credit note info, and
 * total credit value. Inline actions (submit / complete / cancel)
 * are RBAC-gated by `procurement.manage`.
 */
export default function MobileSupplierReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSupplierReturnDetailContent params={params} />
    </Suspense>
  );
}

async function MobileSupplierReturnDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const ret = await prisma.supplierReturn.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, name: true, unit: true, code: true } } },
      },
    },
  });

  if (!ret) {
    return (
      <div>
        <MobileDetailHeader title="Purchase Return" backHref="/m/supplier-returns" />
        <MobileEmptyState icon={Undo2} title="Return not found" />
      </div>
    );
  }

  const totalValue = ret.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);

  // ── RBAC ──────────────────────────────────────────────────
  const canManage = hasPermission(role, PERM.PROCUREMENT_MANAGE);
  const isDraft = ret.status === "DRAFT";
  const isSubmitted = ret.status === "SUBMITTED";
  const isCancellable = ret.status !== "COMPLETED" && ret.status !== "CANCELLED";

  const actions = canManage
    ? [
        ...(isDraft
          ? [
              {
                label: "Submit Return",
                icon: "Send",
                endpoint: `/api/supplier-returns/${ret.id}`,
                body: { action: "submit" },
                successMsg: `Return ${ret.returnNumber} submitted`,
                variant: "primary" as const,
                confirm: "Submit this supplier return?",
              },
            ]
          : []),
        ...(isSubmitted
          ? [
              {
                label: "Mark Completed",
                icon: "CheckCircle2",
                endpoint: `/api/supplier-returns/${ret.id}`,
                body: { action: "complete" },
                successMsg: `Return ${ret.returnNumber} completed`,
                variant: "primary" as const,
                confirm: "Mark this return as completed (credit note received)?",
              },
            ]
          : []),
        ...(isCancellable
          ? [
              {
                label: "Cancel Return",
                icon: "XCircle",
                endpoint: `/api/supplier-returns/${ret.id}`,
                body: { action: "cancel" },
                successMsg: `Return ${ret.returnNumber} cancelled`,
                variant: "danger" as const,
                confirm: "Cancel this supplier return? This cannot be undone.",
              },
            ]
          : []),
      ]
    : [];

  return (
    <div>
      <MobileDetailHeader
        title={ret.returnNumber}
        subtitle={`${ret.supplier.name} · ${formatDate(ret.returnDate)}`}
        backHref="/m/supplier-returns"
        right={<MobileStatusBadge status={ret.status} />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Credit Value" value={formatCurrency(totalValue)} icon={Undo2} tone="warning" />
        <MobileStatCard label="Line Items" value={String(ret.lines.length)} icon={Undo2} />
      </div>

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Building2} title="Supplier" value={ret.supplier.name} />
        <MobileInfoRow icon={MapPin} title="From Location" value={ret.location.name} />
        <MobileInfoRow icon={FileText} title="Return Date" value={formatDate(ret.returnDate)} />
        {ret.creditNoteNo && <MobileInfoRow icon={FileText} title="Credit Note No" value={ret.creditNoteNo} />}
        {ret.notes && <MobileInfoRow icon={FileText} title="Notes" value={ret.notes} />}
      </div>

      <MobileSectionTitle>Line Items ({ret.lines.length})</MobileSectionTitle>
      {ret.lines.length === 0 ? (
        <MobileEmptyState icon={Undo2} title="No line items" />
      ) : (
        <div>
          {ret.lines.map((l) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.material.id}`}
              className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Undo2 className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body">{l.material.name}</div>
                <div className="truncate text-caption text-muted-foreground">
                  {l.material.code}
                  {l.reason ? ` · ${l.reason}` : ""} · {formatCurrency(toNum(l.unitCost))}/{l.material.unit}
                </div>
              </div>
              <span className="shrink-0 text-body font-semibold tnum text-foreground">
                {formatNumber(toNum(l.qty), 0)} {l.material.unit}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Inline actions ────────────────────────────────────── */}
      <MobileDetailActions actions={actions} />
    </div>
  );
}
