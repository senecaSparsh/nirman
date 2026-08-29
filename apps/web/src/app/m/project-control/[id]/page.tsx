import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getEvmMetrics } from "@nirman/services";
import { Gauge, TrendingUp, TrendingDown, AlertTriangle, Target, DollarSign } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileNoAccess,
  MobileEmptyState,
  SectionHead,
} from "@/components/mobile/v2/primitives";

export const metadata = { title: "Project Control — Nirman" };

export default function MobileProjectControlDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={5} />}>
      <MobileProjectControlDetailContent params={params} />
    </Suspense>
  );
}

async function MobileProjectControlDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROJECT_CONTROL_VIEW)) {
    return <MobileNoAccess what="project control metrics" permission={PERM.PROJECT_CONTROL_VIEW} />;
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true, name: true, totalBudget: true },
  });

  if (!project) {
    return (
      <MobileEmptyState
        icon={Gauge}
        title="Project not found"
        hint="This project may have been deleted or doesn't exist."
      />
    );
  }

  let evm;
  try {
    evm = await getEvmMetrics(project.id);
  } catch {
    return (
      <MobileEmptyState
        icon={Gauge}
        title="Unable to compute metrics"
        hint="Make sure BOQ and measurement data exist for this project."
      />
    );
  }

  const pv = toNum(evm.pv);
  const ev = toNum(evm.ev);
  const ac = toNum(evm.ac);
  const cv = toNum(evm.cv);
  const sv = toNum(evm.sv);
  const cpi = toNum(evm.cpi);
  const spi = toNum(evm.spi);
  const eac = toNum(evm.eac);
  const vac = toNum(evm.vac);
  const pctComplete = toNum(evm.pctComplete);

  const cpiColor = cpi >= 1 ? "var(--color-go)" : cpi >= 0.9 ? "var(--color-signal)" : "var(--color-stop)";
  const spiColor = spi >= 1 ? "var(--color-go)" : spi >= 0.9 ? "var(--color-signal)" : "var(--color-stop)";
  const cvColor = cv >= 0 ? "var(--color-go)" : "var(--color-stop)";
  const svColor = sv >= 0 ? "var(--color-go)" : "var(--color-stop)";

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header card */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-[0.625rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
          Earned Value Analysis
        </p>
        <p className="text-[0.875rem] font-bold leading-tight mb-2" style={{ color: "var(--color-ink-950)" }}>
          {project.name}
        </p>
        {/* % Complete hero */}
        <div className="text-center mt-2">
          <p className="text-[0.5625rem] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
            Project Completion
          </p>
          <p className="text-[2rem] font-bold tabular-nums leading-none" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(pctComplete, 1)}%
          </p>
          <div className="h-2 rounded-full overflow-hidden mt-2" style={{ backgroundColor: "var(--color-concrete)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, pctComplete)}%`, backgroundColor: "var(--color-go)" }}
            />
          </div>
        </div>
      </div>

      {/* EVM Triple Constraint */}
      <div>
        <SectionHead title="Triple Constraint" />
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="PV" sublabel="Planned" value={formatCurrency(pv)} icon={Target} />
          <StatCard label="EV" sublabel="Earned" value={formatCurrency(ev)} icon={TrendingUp} tone="go" />
          <StatCard label="AC" sublabel="Actual" value={formatCurrency(ac)} icon={DollarSign} tone="signal" />
        </div>
      </div>

      {/* Variances */}
      <div>
        <SectionHead title="Variances" />
        <div className="grid grid-cols-2 gap-2">
          <VarianceCard
            label="Cost Variance (CV)"
            value={formatCurrency(cv)}
            sublabel={cv >= 0 ? "Under budget" : "Over budget"}
            color={cvColor}
            icon={cv >= 0 ? TrendingDown : AlertTriangle}
          />
          <VarianceCard
            label="Schedule Variance (SV)"
            value={formatCurrency(sv)}
            sublabel={sv >= 0 ? "Ahead of schedule" : "Behind schedule"}
            color={svColor}
            icon={sv >= 0 ? TrendingUp : AlertTriangle}
          />
        </div>
      </div>

      {/* Performance Indices */}
      <div>
        <SectionHead title="Performance Indices" />
        <div className="grid grid-cols-2 gap-2">
          <IndexCard label="CPI" sublabel="Cost Performance" value={formatNumber(cpi, 2)} color={cpiColor} hint={cpi >= 1 ? "Efficient" : "Over budget"} />
          <IndexCard label="SPI" sublabel="Schedule Performance" value={formatNumber(spi, 2)} color={spiColor} hint={spi >= 1 ? "On time" : "Behind"} />
        </div>
      </div>

      {/* Forecast */}
      <div>
        <SectionHead title="Forecast" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          <DetailRow label="EAC (Estimate at Completion)" value={formatCurrency(eac)} />
          <DetailRow label="VAC (Variance at Completion)" value={formatCurrency(vac)} />
          {project.totalBudget && (
            <DetailRow label="Original Budget" value={formatCurrency(toNum(project.totalBudget))} />
          )}
        </div>
      </div>

      {/* Project link */}
      <Link
        href={`/m/projects/${project.id}`}
        className="rounded-[0.5rem] border p-2.5 press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>View Project</p>
          <p className="text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{project.name}</p>
        </div>
      </Link>
    </div>
  );
}

function StatCard({
  label,
  sublabel,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  sublabel: string;
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
      className="rounded-[0.5rem] border p-2"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon className="size-3" style={{ color: toneColor }} />}
        <p className="text-[0.5625rem] font-bold" style={{ color: toneColor }}>{label}</p>
      </div>
      <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>{sublabel}</p>
      <p className="text-[0.6875rem] font-bold tabular-nums mt-0.5" style={{ color: "var(--color-ink-950)" }}>
        {value}
      </p>
    </div>
  );
}

function VarianceCard({
  label,
  value,
  sublabel,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-1 mb-1">
        <Icon className="size-3" style={{ color }} />
        <p className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-700)" }}>{label}</p>
      </div>
      <p className="text-[0.75rem] font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[0.4375rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>{sublabel}</p>
    </div>
  );
}

function IndexCard({
  label,
  sublabel,
  value,
  color,
  hint,
}: {
  label: string;
  sublabel: string;
  value: string;
  color: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <p className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-700)" }}>{label}</p>
      <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>{sublabel}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <p className="text-[1rem] font-bold tabular-nums" style={{ color }}>{value}</p>
        <p className="text-[0.4375rem] font-semibold" style={{ color }}>{hint}</p>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2" style={{ backgroundColor: "var(--color-paper)" }}>
      <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      <p className="text-[0.625rem] font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{value}</p>
    </div>
  );
}
