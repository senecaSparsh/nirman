import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { StandardConsumptionsView } from "@/components/standard-consumptions/standard-consumptions-view";
import { NoAccess } from "@/components/no-access";

export default function StandardConsumptionsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading consumption benchmarks…" variant="list" />}>
        <StandardConsumptionsContent />
      </Suspense>
    </div>
  );
}

async function StandardConsumptionsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="consumption benchmarks" />;
  }

  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);

  const [benchmarks, materials] = await Promise.all([
    prisma.standardConsumption.findMany({
      where: { companyId: company.id },
      include: { material: { select: { code: true, name: true, unit: true } } },
      orderBy: [{ workType: "asc" }, { material: { name: "asc" } }],
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = benchmarks.map((b) => ({
    id: b.id,
    workType: b.workType,
    materialId: b.materialId,
    materialCode: b.material.code,
    materialName: b.material.name,
    unit: b.material.unit,
    standardQty: toNum(b.standardQty),
    baseQty: toNum(b.baseQty),
    unitOfMeasure: b.unitOfMeasure,
    notes: b.notes,
  }));

  const workTypes = [...new Set(rows.map((r) => r.workType))].sort();

  return (
    <>
      <PageHeader
        title="Consumption Benchmarks"
        description="Define standard material consumption rates per work type (e.g. 1.5 t steel per 100 sqft of foundation). When a DPR is submitted, the system compares actual consumption against these benchmarks and auto-detects over-consumption as generated scrap."
        stats={[
          { label: "Benchmarks", value: rows.length },
          { label: "Work Types", value: workTypes.length },
        ]}
      />
      <StandardConsumptionsView
        benchmarks={rows}
        materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
        permissions={{ canManage }}
      />
    </>
  );
}
