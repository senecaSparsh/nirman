import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import { Printer, FileText } from "lucide-react";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileRequisitionActions } from "@/components/mobile/mobile-requisition-actions";

/**
 * /m/requisitions/[id] — requisition detail as a workflow document.
 *
 * Distinct from other detail pages: no hero card, no KPI grid, no icon boxes.
 * Instead: compact header strip → vertical workflow timeline → line items
 * table → notes block → sticky bottom action bar.
 */
export default function MobileRequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRequisitionDetailContent params={params} />
    </Suspense>
  );
}

async function MobileRequisitionDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const req = await prisma.materialRequisition.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { name: true } },
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      vendorQuotes: { select: { id: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true, currentCost: true } },
          preferredSupplier: { select: { id: true, name: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!req) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={FileText} title="Requisition not found" />
      </div>
    );
  }

  const canApprove = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canManage = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  const [suppliers, locations] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true, projectId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const lines = req.lines.map((l) => ({
    id: l.id,
    materialId: l.material.id,
    materialName: l.material.name,
    materialCode: l.material.code,
    unit: l.material.unit,
    qtyRequested: toNum(l.qtyRequested),
    notes: l.notes,
    currentStock: l.currentStock != null ? toNum(l.currentStock) : null,
    lastRate: l.lastRate != null ? toNum(l.lastRate) : null,
    suggestedCost: toNum(l.material.currentCost),
    preferredSupplierId: l.preferredSupplierId,
  }));

  const reqPayload = {
    id: req.id,
    reqNumber: req.reqNumber,
    status: req.status,
    projectName: req.project?.name ?? null,
    projectId: req.project?.id ?? null,
    phaseName: req.phase?.name ?? null,
    requestDate: req.requestDate.toISOString(),
    neededByDate: req.neededByDate?.toISOString() ?? null,
    notes: req.notes,
    rejectReason: req.rejectReason,
    convertedPoId: req.convertedPoId,
  };

  // Timeline data
  const totalItems = lines.reduce((s, l) => s + l.qtyRequested, 0);
  const quoteCount = req.vendorQuotes.length;
  const quotesMet = quoteCount >= req.minQuotesRequired || req.quotesWaived;

  // Status colors
  const statusColor =
    req.status === "CONVERTED" ? "var(--color-go)" :
    req.status === "APPROVED" ? "var(--color-steel)" :
    req.status === "SUBMITTED" ? "var(--color-signal)" :
    req.status === "REJECTED" ? "var(--color-stop)" :
    "var(--color-ink-400)";

  // Needed-by urgency
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let neededText = "";
  let neededUrgent = false;
  if (req.neededByDate) {
    const needed = new Date(req.neededByDate); needed.setHours(0, 0, 0, 0);
    const diff = Math.round((needed.getTime() - today.getTime()) / 86400000);
    if (diff < 0) { neededText = `${Math.abs(diff)}d overdue`; neededUrgent = true; }
    else if (diff === 0) { neededText = "today"; neededUrgent = true; }
    else if (diff <= 3) { neededText = `${diff}d left`; neededUrgent = true; }
    else { neededText = formatDate(req.neededByDate); }
  }

  return (
    <div>
      {/* ── Compact header strip ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <a
          href={`/print/requisition/${req.id}`}
          className="flex items-center gap-1 text-[0.6875rem] font-semibold px-2.5 py-1 rounded-[0.5rem] border press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
        >
          <Printer className="size-3.5" />
          Print
        </a>
      </div>

      {/* Req number + status + needed-by in one compact block */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-[1.125rem] font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>
            {req.reqNumber}
          </h1>
          <span
            className="text-[0.5625rem] font-bold uppercase px-2 py-0.5 rounded-[0.375rem]"
            style={{ backgroundColor: statusColor, color: "#fff" }}
          >
            {req.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
          <Link
            href={`/m/projects/${req.project?.id ?? ""}`}
            className="font-semibold hover:underline"
            style={{ color: "var(--color-ink-700)" }}
          >
            {req.project?.name ?? "No project"}
          </Link>
          {neededText ? (
            <span
              className="font-bold px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: neededUrgent ? "var(--color-stop)" : "var(--color-concrete)",
                color: neededUrgent ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {neededText}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Workflow timeline ── */}
      <div className="mb-5">
        <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-steel)" }}>
          Workflow
        </p>
        <div className="relative pl-6">
          {/* Vertical line */}
          <div
            className="absolute left-[7px] top-1 bottom-1 w-px"
            style={{ backgroundColor: "var(--color-line)" }}
          />

          <TimelineStep
            done
            color="var(--color-go)"
            label="Created"
            date={formatDate(req.createdAt)}
            detail={req.requestedBy?.name ?? "—"}
          />

          {req.status !== "DRAFT" ? (
            <TimelineStep
              done
              color="var(--color-go)"
              label="Submitted"
              date={formatDate(req.requestDate)}
            />
          ) : (
            <TimelineStep
              color="var(--color-signal)"
              label="Draft — not submitted"
              detail="Awaiting submission"
            />
          )}

          {req.status === "SUBMITTED" ? (
            <TimelineStep
              color="var(--color-signal)"
              label="Awaiting approval"
              detail={canApprove ? "Your action needed" : "Pending approver review"}
            />
          ) : req.status === "APPROVED" || req.status === "CONVERTED" ? (
            <TimelineStep
              done
              color="var(--color-go)"
              label="Approved"
              date={req.approvedAt ? formatDate(req.approvedAt) : "—"}
              detail={req.approvedBy?.name ?? "—"}
            />
          ) : req.status === "REJECTED" ? (
            <TimelineStep
              done
              color="var(--color-stop)"
              label="Rejected"
              date={req.rejectedAt ? formatDate(req.rejectedAt) : "—"}
              detail={req.rejectReason ?? req.rejectedBy?.name ?? "—"}
            />
          ) : null}

          {req.status === "APPROVED" ? (
            <TimelineStep
              color={quotesMet ? "var(--color-go)" : "var(--color-signal)"}
              label={quotesMet ? "Ready to convert" : "Needs quotes"}
              detail={quotesMet
                ? "Convert to purchase order"
                : `${quoteCount}/${req.minQuotesRequired} vendor quotes`}
            />
          ) : null}

          {req.status === "CONVERTED" && req.convertedPoId ? (
            <TimelineStep
              done
              color="var(--color-go)"
              label="Converted to PO"
              detail={
                <Link
                  href={`/m/procurement/${req.convertedPoId}`}
                  className="font-semibold hover:underline"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  View purchase order →
                </Link>
              }
            />
          ) : null}
        </div>
      </div>

      {/* ── Line items table ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.5625rem] font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
            Items
          </p>
          <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
            {lines.length} lines · {formatNumber(totalItems, 0)} units
          </span>
        </div>
        <div
          className="rounded-[0.625rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {lines.map((l, i) => (
            <div
              key={l.id}
              className="flex items-center gap-2 px-2.5 py-2"
              style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {l.materialName}
                </p>
                <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                  {l.materialCode}
                  {l.currentStock != null ? ` · stock ${formatNumber(l.currentStock, 0)}` : ""}
                  {l.lastRate != null ? ` · last ${formatCurrency(l.lastRate)}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(l.qtyRequested, 0)}
                </p>
                <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  {l.unit}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notes block ── */}
      {req.notes ? (
        <div className="mb-5">
          <p className="text-[0.5625rem] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
            Notes
          </p>
          <div
            className="rounded-[0.625rem] border-l-2 p-3 text-[0.75rem] italic"
            style={{
              borderColor: "var(--color-steel)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-700)",
            }}
          >
            {req.notes}
          </div>
        </div>
      ) : null}

      {/* ── Sticky bottom action bar ── */}
      <div
        className="sticky bottom-0 z-20 border-t mt-4"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto w-full max-w-[34rem] px-3.5 py-2.5 pb-safe">
          <MobileRequisitionActions
            requisition={reqPayload}
            lines={lines}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId }))}
            canApprove={canApprove}
            canManage={canManage}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Timeline step component ── */
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
