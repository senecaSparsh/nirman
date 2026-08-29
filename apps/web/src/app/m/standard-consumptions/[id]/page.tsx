import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";
import {
  MobileNoAccess,
  MobileEmptyState,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { Beaker, Package, Ruler } from "lucide-react";
import { MobileStandardConsumptionActions } from "./MobileStandardConsumptionActions";

export const metadata = { title: "Standard Consumption — Nirman" };

export default function MobileStandardConsumptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={3} />}>
      <MobileStandardConsumptionDetailContent params={params} />
    </Suspense>
  );
}

async function MobileStandardConsumptionDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <MobileNoAccess what="standard consumption details" permission={PERM.INVENTORY_VIEW} />;
  }

  const { id } = await params;

  const [sc, materials] = await Promise.all([
    prisma.standardConsumption.findFirst({
      where: { id, companyId: company.id },
      include: {
        material: { select: { id: true, name: true, unit: true, code: true } },
      },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!sc) {
    return (
      <MobileEmptyState
        icon={Beaker}
        title="Standard consumption not found"
        hint="This benchmark may have been deleted or doesn't exist."
      />
    );
  }

  const standardQty = toNum(sc.standardQty);
  const baseQty = toNum(sc.baseQty);
  const perUnitQty = baseQty > 0 ? standardQty / baseQty : 0;

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header card */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            {sc.workType}
          </p>
        </div>
        <p className="text-m-section font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
          {sc.material.name}
        </p>
        <p className="text-m-label mb-2" style={{ color: "var(--color-ink-500)" }}>
          {sc.material.code ? `${sc.material.code} · ` : ""}
          {sc.unitOfMeasure}
        </p>
        {sc.notes && (
          <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
            {sc.notes}
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div>
        <SectionHead title="Benchmark Summary" />
        <div className="grid grid-cols-4 gap-1.5">
          <StatCard label="Standard Qty" value={`${formatNumber(standardQty, 3)} ${sc.material.unit}`} icon={Package} tone="go" />
          <StatCard label="Base Qty" value={formatNumber(baseQty, 3)} icon={Ruler} />
          <StatCard label="Per Unit" value={`${formatNumber(perUnitQty, 5)} ${sc.material.unit}`} icon={Beaker} tone="signal" />
        </div>
      </div>

      {/* Material link */}
      <Link
        href={`/m/materials/${sc.material.id}`}
        className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>View Material</p>
          <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{sc.material.name}</p>
        </div>
      </Link>

      {/* Edit / Delete actions */}
      {hasPermission(role, PERM.INVENTORY_MANAGE) ? (
        <MobileStandardConsumptionActions
          consumptionId={sc.id}
          initialWorkType={sc.workType}
          initialMaterialId={sc.materialId}
          initialStandardQty={String(toNum(sc.standardQty))}
          initialBaseQty={String(toNum(sc.baseQty))}
          initialUnitOfMeasure={sc.unitOfMeasure}
          initialNotes={sc.notes ?? ""}
          materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit ?? "" }))}
        />
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
