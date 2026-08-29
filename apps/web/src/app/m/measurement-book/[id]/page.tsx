import { Suspense } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileNoAccess,
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { BookOpen, Calendar, IndianRupee, Package, User, CheckCircle } from "lucide-react";
import { MobileMbActions } from "./MobileMbActions";

export const metadata = { title: "Measurement Book Entry — Nirman" };

export default function MobileMbDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={5} />}>
      <MobileMbDetailContent params={params} />
    </Suspense>
  );
}

async function MobileMbDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.MB_VIEW)) {
    return <MobileNoAccess what="measurement book entry details" permission={PERM.MB_VIEW} />;
  }

  const { id } = await params;

  const entry = await prisma.measurementBookEntry.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      boqItem: { select: { id: true, serialNo: true, description: true, unit: true, rate: true, estimatedQty: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      measuredBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  if (!entry) {
    return (
      <MobileEmptyState
        icon={BookOpen}
        title="Measurement entry not found"
        hint="This measurement book entry may have been deleted or doesn't exist."
      />
    );
  }

  const measuredQty = toNum(entry.measuredQty);
  const cumulativeQty = toNum(entry.cumulativeQty);
  const rate = entry.boqItem.rate ? toNum(entry.boqItem.rate) : 0;
  const amount = measuredQty * rate;
  const estimatedQty = entry.boqItem.estimatedQty ? toNum(entry.boqItem.estimatedQty) : null;
  const variance = estimatedQty != null ? cumulativeQty - estimatedQty : null;
  const variancePct = estimatedQty != null && estimatedQty > 0 ? (variance! / estimatedQty) * 100 : null;

  const canVerify = hasPermission(role, PERM.MB_VERIFY);
  const canApprove = hasPermission(role, PERM.MB_APPROVE);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header card */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {entry.mbNumber}
          </p>
          <div className="flex items-center gap-2">
            <a
              href={`/print/measurement-book/${entry.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold press"
              style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
            >
              <Printer className="size-3.5" />
              Print
            </a>
            <MobileStatusBadge status={entry.status} />
          </div>
        </div>
        <p className="text-m-section font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
          {entry.boqItem.description}
        </p>
        <p className="text-m-label mb-2" style={{ color: "var(--color-ink-500)" }}>
          BOQ {entry.boqItem.serialNo}
          {" · "}
          {entry.project.name}
          {entry.phase ? ` · ${entry.phase.name}` : ""}
        </p>
        {entry.description && (
          <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
            {entry.description}
          </p>
        )}
      </div>

      {/* Quantity summary */}
      <div>
        <SectionHead title="Quantity Summary" />
        <div className="grid grid-cols-4 gap-1.5">
          <StatCard label="Measured Qty" value={`${formatNumber(measuredQty, 3)} ${entry.boqItem.unit ?? ""}`} icon={Package} tone="go" />
          <StatCard label="Cumulative Qty" value={`${formatNumber(cumulativeQty, 3)} ${entry.boqItem.unit ?? ""}`} icon={Package} />
          <StatCard label="Rate" value={formatCurrencyCompact(rate)} icon={IndianRupee} />
          <StatCard label="Amount" value={formatCurrencyCompact(amount)} icon={IndianRupee} tone="signal" />
        </div>
      </div>

      {/* Variance analysis */}
      {estimatedQty != null && (
        <div>
          <SectionHead title="Variance Analysis" />
          <div
            className="rounded-[0.5rem] border divide-y"
            style={{ borderColor: "var(--color-line)" }}
          >
            <DetailRow label="Estimated Qty" value={`${formatNumber(estimatedQty, 3)} ${entry.boqItem.unit ?? ""}`} />
            {variance != null && (
              <DetailRow
                label="Variance"
                value={`${variance >= 0 ? "+" : ""}${formatNumber(variance, 3)} ${entry.boqItem.unit ?? ""}`}
              />
            )}
            {variancePct != null && (
              <DetailRow
                label="Variance %"
                value={`${variancePct >= 0 ? "+" : ""}${formatNumber(variancePct, 1)}%`}
              />
            )}
          </div>
        </div>
      )}

      {/* Details */}
      <div>
        <SectionHead title="Details" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          <DetailRow label="Measure Date" value={formatDate(entry.measureDate)} icon={Calendar} />
          {entry.locationRef && <DetailRow label="Location" value={entry.locationRef} />}
          {entry.wbsNode && <DetailRow label="WBS Node" value={`${entry.wbsNode.code} · ${entry.wbsNode.name}`} />}
          {entry.rejectReason && <DetailRow label="Reject Reason" value={entry.rejectReason} />}
        </div>
      </div>

      {/* Approval info */}
      <div>
        <SectionHead title="Approval" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          {entry.measuredBy && <DetailRow label="Measured By" value={entry.measuredBy.name} icon={User} />}
          {entry.verifiedBy && <DetailRow label="Verified By" value={entry.verifiedBy.name} icon={CheckCircle} />}
          {entry.verifiedAt && <DetailRow label="Verified At" value={formatDate(entry.verifiedAt)} icon={Calendar} />}
          {entry.approvedBy && <DetailRow label="Approved By" value={entry.approvedBy.name} icon={CheckCircle} />}
          {entry.approvedAt && <DetailRow label="Approved At" value={formatDate(entry.approvedAt)} icon={Calendar} />}
          {!entry.measuredBy && !entry.verifiedBy && !entry.approvedBy && (
            <div className="px-2.5 py-2" style={{ backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-label text-center" style={{ color: "var(--color-ink-500)" }}>No approval activity yet</p>
            </div>
          )}
        </div>
      </div>

      {/* BOQ item link */}
      <Link
        href={`/m/boq/${entry.boqItem.id}`}
        className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>BOQ Item</p>
          <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>
            {entry.boqItem.serialNo} · {entry.boqItem.description}
          </p>
        </div>
      </Link>

      {/* Project link */}
      <Link
        href={`/m/projects/${entry.project.id}`}
        className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Project</p>
          <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{entry.project.name}</p>
        </div>
      </Link>

      {/* Approval action bar */}
      <MobileMbActions
        mbId={entry.id}
        status={entry.status}
        canVerify={canVerify}
        canApprove={canApprove}
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
      className="rounded-[0.5rem] border p-2 overflow-hidden min-w-0"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon className="size-3" style={{ color: "var(--color-ink-400)" }} />}
        <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      </div>
      <p className="text-m-section font-bold tabular-nums truncate" style={{ color: toneColor }}>{value}</p>
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
        <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      </div>
      <p className="text-m-label font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{value}</p>
    </div>
  );
}
