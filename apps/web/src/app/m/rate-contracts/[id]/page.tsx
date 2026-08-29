import { Suspense } from "react";
import Link from "next/link";
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
  MobilePipelineStepper,
  type MobilePipelineStep,
} from "@/components/mobile/v2/primitives";
import { FileText, IndianRupee, Calendar, Package, TrendingUp } from "lucide-react";
import { MobileRateContractCancelBtn } from "./MobileRateContractCancelBtn";

export const metadata = { title: "Rate Contract — Nirman" };

export default function MobileRateContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={4} />}>
      <MobileRateContractDetailContent params={params} />
    </Suspense>
  );
}

async function MobileRateContractDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <MobileNoAccess what="rate contract details" permission={PERM.PROCUREMENT_VIEW} />;
  }

  const { id } = await params;

  const rc = await prisma.rateContract.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, gstin: true } },
      material: { select: { id: true, name: true, unit: true, code: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!rc) {
    return (
      <MobileEmptyState
        icon={FileText}
        title="Rate contract not found"
        hint="This rate contract may have been deleted or doesn't exist."
      />
    );
  }

  const agreedRate = toNum(rc.agreedRate);
  const minQty = rc.minQty ? toNum(rc.minQty) : null;
  const maxQty = rc.maxQty ? toNum(rc.maxQty) : null;
  const totalReleasedQty = toNum(rc.totalReleasedQty);
  const now = new Date();
  const isActive = new Date(rc.validFrom) <= now && new Date(rc.validTo) >= now;
  const isExpired = new Date(rc.validTo) < now;
  const statusLabel = rc.status === "CANCELLED" ? "CANCELLED" : isActive ? "ACTIVE" : isExpired ? "EXPIRED" : "PENDING";

  // Lifecycle pipeline: Pending → Active → Expired/Cancelled
  const rcPipelineSteps: MobilePipelineStep[] = rc.status === "CANCELLED"
    ? [
        { label: "Pending", state: "skipped" },
        { label: "Active", state: "skipped" },
        { label: "Cancelled", state: "current" },
      ]
    : [
        { label: "Pending", state: statusLabel === "PENDING" ? "current" : "done" },
        { label: "Active", state: statusLabel === "ACTIVE" ? "current" : statusLabel === "EXPIRED" ? "done" : "pending" },
        { label: "Expired", state: statusLabel === "EXPIRED" ? "current" : "pending" },
      ];

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header card */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {rc.contractNumber}
          </p>
          <MobileStatusBadge status={statusLabel} />
        </div>
        <p className="text-m-section font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
          {rc.material.name}
        </p>
        <p className="text-m-label mb-2" style={{ color: "var(--color-ink-500)" }}>
          {rc.supplier.name}
          {rc.material.code ? ` · ${rc.material.code}` : ""}
        </p>
        {rc.notes && (
          <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
            {rc.notes}
          </p>
        )}
      </div>

      {/* Lifecycle pipeline */}
      <div className="rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <MobilePipelineStepper steps={rcPipelineSteps} />
      </div>

      {/* Financial summary */}
      <div>
        <SectionHead title="Financial Summary" />
        <div className="grid grid-cols-4 gap-1.5">
          <StatCard label="Agreed Rate" value={`${formatCurrencyCompact(agreedRate)}/${rc.material.unit}`} icon={IndianRupee} tone="go" />
          <StatCard label="Released Qty" value={formatNumber(totalReleasedQty, 3)} icon={TrendingUp} />
          {minQty != null && <StatCard label="Min Order Qty" value={formatNumber(minQty, 3)} icon={Package} />}
          {maxQty != null && <StatCard label="Max Qty" value={formatNumber(maxQty, 3)} icon={Package} tone="signal" />}
        </div>
      </div>

      {/* Validity */}
      <div>
        <SectionHead title="Validity Period" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          <DetailRow label="Valid From" value={formatDate(rc.validFrom)} icon={Calendar} />
          <DetailRow label="Valid To" value={formatDate(rc.validTo)} icon={Calendar} />
          <DetailRow label="Status" value={statusLabel} />
        </div>
      </div>

      {/* Supplier details */}
      <div>
        <SectionHead title="Supplier" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          <DetailRow label="Name" value={rc.supplier.name} />
          {rc.supplier.phone && <DetailRow label="Phone" value={rc.supplier.phone} />}
          {rc.supplier.gstin && <DetailRow label="GSTIN" value={rc.supplier.gstin} />}
        </div>
      </div>

      {/* Supplier link */}
      <Link
        href={`/m/suppliers/${rc.supplier.id}`}
        className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>View Supplier</p>
          <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{rc.supplier.name}</p>
        </div>
      </Link>

      {/* Cancel action — only for active/pending contracts, RBAC-gated */}
      {hasPermission(role, PERM.PROCUREMENT_MANAGE) && rc.status !== "CANCELLED" && !isExpired ? (
        <MobileRateContractCancelBtn contractId={rc.id} contractNumber={rc.contractNumber} />
      ) : null}
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
