import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getEvmMetrics } from "@nirman/services";
import { Gauge, TrendingUp, TrendingDown, AlertTriangle, Target, DollarSign } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileProjectControlSelector } from "./MobileProjectControlSelector";

/**
 * /m/project-control — mobile EVM (Earned Value Management) dashboard.
 * Shows PV (Planned Value), EV (Earned Value), AC (Actual Cost),
 * CPI, SPI, EAC, and % complete for a selected project.
 */
export default function MobileProjectControlPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileProjectControlContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileProjectControlContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  hasPermission(role, PERM.FINANCE_VIEW);
  const { project: projectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!projectId) {
    return (
      <div>
        <MobileProjectControlSelector projects={projects} selectedId={null} />
        <MobileEmptyState
          icon={Gauge}
          title="Select a project"
          hint="Choose a project to view EVM metrics"
        />
      </div>
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: company.id, deletedAt: null },
    select: { id: true, name: true, totalBudget: true },
  });

  if (!project) {
    return (
      <div>
        <MobileProjectControlSelector projects={projects} selectedId={projectId} />
        <MobileEmptyState icon={Gauge} title="Project not found" hint="" />
      </div>
    );
  }

  let evm;
  try {
    evm = await getEvmMetrics(projectId);
  } catch {
    return (
      <div>
        <MobileProjectControlSelector projects={projects} selectedId={projectId} />
        <MobileEmptyState icon={Gauge} title="Unable to compute metrics" hint="Make sure BOQ and measurement data exist" />
      </div>
    );
  }

  const pv = evm.pv.toNumber();
  const ev = evm.ev.toNumber();
  const ac = evm.ac.toNumber();
  const cv = evm.cv.toNumber();
  const sv = evm.sv.toNumber();
  const cpi = evm.cpi.toNumber();
  const spi = evm.spi.toNumber();
  const eac = evm.eac.toNumber();
  const vac = evm.vac.toNumber();
  const pctComplete = evm.pctComplete.toNumber();

  const cpiColor = cpi >= 1 ? "var(--color-go)" : cpi >= 0.9 ? "var(--color-signal)" : "var(--color-stop)";
  const spiColor = spi >= 1 ? "var(--color-go)" : spi >= 0.9 ? "var(--color-signal)" : "var(--color-stop)";
  const cvColor = cv >= 0 ? "var(--color-go)" : "var(--color-stop)";
  const svColor = sv >= 0 ? "var(--color-go)" : "var(--color-stop)";

  return (
    <div>
      <MobileProjectControlSelector projects={projects} selectedId={projectId} />

      {/* % Complete Hero */}
      <div
        className="rounded-[0.875rem] border p-4 mb-3 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
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

      {/* EVM Triple Constraint */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <EvmCard label="PV" sublabel="Planned" value={formatCurrency(pv)} icon={Target} />
        <EvmCard label="EV" sublabel="Earned" value={formatCurrency(ev)} icon={TrendingUp} tone="go" />
        <EvmCard label="AC" sublabel="Actual" value={formatCurrency(ac)} icon={DollarSign} tone="signal" />
      </div>

      {/* Variances */}
      <div className="grid grid-cols-2 gap-2 mb-3">
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

      {/* Performance Indices */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <IndexCard label="CPI" sublabel="Cost Performance" value={formatNumber(cpi, 2)} color={cpiColor} hint={cpi >= 1 ? "Efficient" : "Over budget"} />
        <IndexCard label="SPI" sublabel="Schedule Performance" value={formatNumber(spi, 2)} color={spiColor} hint={spi >= 1 ? "On time" : "Behind"} />
      </div>

      {/* Forecast */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-[0.6875rem] font-bold mb-2" style={{ color: "var(--color-ink-950)" }}>
          Forecast
        </p>
        <div className="space-y-1.5">
          <ForecastRow label="EAC (Estimate at Completion)" value={formatCurrency(eac)} />
          <ForecastRow label="VAC (Variance at Completion)" value={formatCurrency(vac)} color={vac >= 0 ? "var(--color-go)" : "var(--color-stop)"} />
          {project.totalBudget && (
            <ForecastRow label="Original Budget" value={formatCurrency(project.totalBudget.toNumber())} />
          )}
        </div>
      </div>
    </div>
  );
}

function EvmCard({ label, sublabel, value, icon: Icon, tone }: { label: string; sublabel: string; value: string; icon: any; tone?: string }) {
  const color = tone === "go" ? "var(--color-go)" : tone === "signal" ? "var(--color-signal)" : "var(--color-ink-950)";
  return (
    <div
      className="rounded-[0.625rem] border p-2"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-1 mb-1">
        <Icon className="size-3" style={{ color }} />
        <p className="text-[0.5625rem] font-bold" style={{ color }}>{label}</p>
      </div>
      <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>{sublabel}</p>
      <p className="text-[0.6875rem] font-bold tabular-nums mt-0.5" style={{ color: "var(--color-ink-950)" }}>
        {value}
      </p>
    </div>
  );
}

function VarianceCard({ label, value, sublabel, color, icon: Icon }: { label: string; value: string; sublabel: string; color: string; icon: any }) {
  return (
    <div
      className="rounded-[0.625rem] border p-2.5"
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

function IndexCard({ label, sublabel, value, color, hint }: { label: string; sublabel: string; value: string; color: string; hint: string }) {
  return (
    <div
      className="rounded-[0.625rem] border p-2.5"
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

function ForecastRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>{label}</span>
      <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: color ?? "var(--color-ink-950)" }}>{value}</span>
    </div>
  );
}
