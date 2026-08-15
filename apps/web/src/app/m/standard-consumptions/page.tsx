import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Beaker } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileSectionTitle,
} from "@/components/mobile/v2/primitives";
import { MobileStandardConsumptionsList } from "./MobileStandardConsumptionsList";
import { MobileStandardConsumptionsFab } from "./MobileStandardConsumptionsFab";

/**
 * /m/standard-consumptions — mobile standard consumption benchmarks.
 * Defines how much of a material SHOULD be consumed per unit of work.
 */
export default function MobileStandardConsumptionsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileStandardConsumptionsContent />
    </Suspense>
  );
}

async function MobileStandardConsumptionsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);

  const [benchmarks, materials] = await Promise.all([
    prisma.standardConsumption.findMany({
      where: { companyId: company.id },
      orderBy: [{ workType: "asc" }, { material: { name: "asc" } }],
      include: {
        material: { select: { id: true, name: true, unit: true } },
      },
    }),
    canManage
      ? prisma.material.findMany({
          where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unit: true },
        })
      : [],
  ]);

  const workTypes = [...new Set(benchmarks.map((b) => b.workType))];

  const serialized = benchmarks.map((b) => ({
    id: b.id,
    workType: b.workType,
    materialName: b.material.name,
    materialUnit: b.material.unit,
    standardQty: toNum(b.standardQty),
    baseQty: toNum(b.baseQty),
    unitOfMeasure: b.unitOfMeasure,
    notes: b.notes,
  }));

  const materialOptions = materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Benchmarks" value={String(benchmarks.length)} icon={Beaker} />
        <MobileStatCard label="Work Types" value={String(workTypes.length)} icon={Beaker} tone="neutral" />
      </div>

      <MobileStandardConsumptionsList items={serialized} />

      {benchmarks.length === 0 && (
        <MobileEmptyState
          icon={Beaker}
          title="No standard consumptions"
          hint={canManage ? "Tap + to define how much material a work type should consume" : "Standard consumption benchmarks will appear here"}
        />
      )}

      {canManage && materialOptions.length > 0 && (
        <MobileStandardConsumptionsFab materials={materialOptions} />
      )}
    </div>
  );
}
