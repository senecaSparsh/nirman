import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Undo2, FileText, Building2, MapPin } from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
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
        <div className="mb-4">
          <MobileBackButton fallback="/m/supplier-returns" className="gap-1 text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }} />
        </div>
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
      <div className="flex items-center justify-between gap-2 mb-4">
        <MobileBackButton fallback="/m/supplier-returns" className="gap-1 text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }} />
        <MobileStatusBadge status={ret.status} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Credit Value" value={formatCurrency(totalValue)} icon={Undo2} tone="signal" />
        <MobileStatCard label="Line Items" value={String(ret.lines.length)} icon={Undo2} />
      </div>

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow icon={Building2} title="Supplier" meta={ret.supplier.name} />
        <MobileRow icon={MapPin} title="From Location" meta={ret.location.name} />
        <MobileRow icon={FileText} title="Return Date" meta={formatDate(ret.returnDate)} />
        {ret.creditNoteNo && <MobileRow icon={FileText} title="Credit Note No" meta={ret.creditNoteNo} />}
        {ret.notes && <MobileRow icon={FileText} title="Notes" meta={ret.notes} />}
      </div>

      <MobileSectionTitle>Line Items ({ret.lines.length})</MobileSectionTitle>
      {ret.lines.length === 0 ? (
        <MobileEmptyState icon={Undo2} title="No line items" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {ret.lines.map((l) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.material.id}`}
              className="flex min-h-11 items-center gap-2.5 rounded-[0.875rem] border p-3.5 transition-colors active:opacity-80"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.375rem]"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <Undo2 className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>{l.material.name}</div>
                <div className="truncate text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  {l.material.code}
                  {l.reason ? ` · ${l.reason}` : ""} · {formatCurrency(toNum(l.unitCost))}/{l.material.unit}
                </div>
              </div>
              <span className="shrink-0 text-[0.75rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
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
