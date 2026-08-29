import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileNoAccess,
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
  mobileStatusColor,
} from "@/components/mobile/v2/primitives";
import { FileText, Wrench, IndianRupee, Calendar, TrendingUp } from "lucide-react";
import { MobileWorkOrderActions } from "./MobileWorkOrderActions";

export const metadata = { title: "Work Order — Nirman" };

export default function MobileWorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={5} />}>
      <MobileWorkOrderDetailContent params={params} />
    </Suspense>
  );
}

async function MobileWorkOrderDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.WO_MANAGE)) {
    return <MobileNoAccess what="work order details" permission={PERM.WO_MANAGE} />;
  }

  const { id } = await params;

  const wo = await prisma.subcontractorWorkOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      subcontractor: { select: { id: true, name: true, trade: true, phone: true } },
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      lines: {
        include: {
          boqItem: { select: { id: true, description: true, unit: true } },
        },
        orderBy: { agreedRate: "asc" },
      },
      raBills: {
        orderBy: { billDate: "desc" },
        take: 10,
        select: {
          id: true,
          raBillNumber: true,
          billDate: true,
          status: true,
          grossAmount: true,
          netPayable: true,
          cumulativeGross: true,
        },
      },
    },
  });

  if (!wo) {
    return (
      <MobileEmptyState
        icon={Wrench}
        title="Work order not found"
        hint="This work order may have been deleted or doesn't exist."
      />
    );
  }

  const canManage = hasPermission(role, PERM.WO_MANAGE);
  const canPay = hasPermission(role, PERM.RA_PAY);
  const totalWorkDone = toNum(wo.totalWorkDone);
  const totalPaid = toNum(wo.totalPaid);
  const retentionBalance = toNum(wo.retentionBalance);
  const advanceAmount = toNum(wo.advanceAmount);

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* ── Header card ── */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {wo.workOrderNumber}
          </p>
          <MobileStatusBadge status={wo.status} />
        </div>
        <p className="text-[0.875rem] font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
          {wo.workTitle}
        </p>
        <p className="text-[0.625rem] mb-2" style={{ color: "var(--color-ink-500)" }}>
          {wo.subcontractor.name}
          {wo.subcontractor.trade ? ` · ${wo.subcontractor.trade}` : ""}
          {" · "}
          {wo.project.name}
        </p>
        {wo.description && (
          <p className="text-[0.625rem] leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
            {wo.description}
          </p>
        )}
      </div>

      {/* ── Financial summary ── */}
      <div>
        <SectionHead title="Financial Summary" />
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Work Done" value={formatCurrency(totalWorkDone)} icon={TrendingUp} tone="go" />
          <StatCard label="Total Paid" value={formatCurrency(totalPaid)} icon={IndianRupee} />
          <StatCard label="Retention Held" value={formatCurrency(retentionBalance)} icon={IndianRupee} tone="signal" />
          <StatCard label="Advance" value={formatCurrency(advanceAmount)} icon={IndianRupee} />
        </div>
      </div>

      {/* ── Terms ── */}
      <div>
        <SectionHead title="Terms" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          <DetailRow label="Retention %" value={`${toNum(wo.retentionPct)}%`} />
          <DetailRow label="TDS %" value={`${toNum(wo.tdsPct)}%`} />
          <DetailRow label="TDS Category" value={wo.tdsCategory.replace(/_/g, " ")} />
          <DetailRow label="Advance Recovery" value={`${toNum(wo.advanceRecoveryPct)}%`} />
          <DetailRow label="Defect Liability" value={`${wo.defectLiabilityMonths} months`} />
        </div>
      </div>

      {/* ── Dates ── */}
      <div>
        <SectionHead title="Timeline" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          <DetailRow label="Issued" value={formatDate(wo.issueDate)} icon={Calendar} />
          {wo.startDate && <DetailRow label="Start" value={formatDate(wo.startDate)} icon={Calendar} />}
          {wo.endDate && <DetailRow label="End" value={formatDate(wo.endDate)} icon={Calendar} />}
        </div>
      </div>

      {/* ── Scope (work order lines) ── */}
      <div>
        <SectionHead title={`Scope (${wo.lines.length} items)`} />
        <div
          className="rounded-[0.5rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)" }}
        >
          {wo.lines.length === 0 ? (
            <div className="p-3 text-center">
              <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>No scope items</p>
            </div>
          ) : (
            wo.lines.map((line, i) => (
              <div
                key={line.id}
                className="p-2.5"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <p className="text-[0.625rem] font-semibold leading-snug mb-1" style={{ color: "var(--color-ink-950)" }}>
                  {line.boqItem.description}
                </p>
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Rate</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(toNum(line.agreedRate))}/{line.boqItem.unit}
                    </p>
                  </div>
                  <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                  <div>
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cumulative</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatNumber(toNum(line.cumulativeQty), 2)} {line.boqItem.unit}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Amount</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(toNum(line.cumulativeAmount))}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RA Bills ── */}
      <div>
        <SectionHead title={`RA Bills (${wo.raBills.length})`} />
        {wo.raBills.length === 0 ? (
          <div
            className="rounded-[0.5rem] border p-3 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <FileText className="size-5 mx-auto mb-1.5" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>No RA bills yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {wo.raBills.map((bill) => (
              <Link
                key={bill.id}
                href={`/m/work-orders/${wo.id}?bill=${bill.id}`}
                className="rounded-[0.5rem] border p-2.5 press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                    {bill.raBillNumber}
                  </p>
                  <MobileStatusBadge status={bill.status} />
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Gross</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(toNum(bill.grossAmount))}
                    </p>
                  </div>
                  <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                  <div>
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Net</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                      {formatCurrency(toNum(bill.netPayable))}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Date</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                      {formatDate(bill.billDate)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Subcontractor link ── */}
      <Link
        href={`/m/suppliers/${wo.subcontractor.id}`}
        className="rounded-[0.5rem] border p-2.5 press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Subcontractor</p>
          <p className="text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{wo.subcontractor.name}</p>
        </div>
      </Link>

      {/* ── Workflow actions ── */}
      <MobileWorkOrderActions
        workOrderId={wo.id}
        status={wo.status as "DRAFT" | "ISSUED" | "ACTIVE" | "COMPLETED" | "CLOSED"}
        canManage={canManage}
        canPay={canPay}
        advanceBalance={advanceAmount}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  tone?: "default" | "go" | "signal" | "stop";
}) {
  const toneColor = {
    default: "var(--color-ink-950)",
    go: "var(--color-go)",
    signal: "var(--color-signal-dark)",
    stop: "var(--color-stop)",
  }[tone];

  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon className="size-3" style={{ color: "var(--color-ink-400)" }} />}
        <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      </div>
      <p className="text-[0.75rem] font-bold tabular-nums" style={{ color: toneColor }}>{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2" style={{ backgroundColor: "var(--color-paper)" }}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3" style={{ color: "var(--color-ink-400)" }} />}
        <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      </div>
      <p className="text-[0.625rem] font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{value}</p>
    </div>
  );
}
