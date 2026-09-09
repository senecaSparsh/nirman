import { prisma } from "@nirman/db";
import { toNum, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { Beaker } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileStandardConsumptionsList } from "./MobileStandardConsumptionsList";
import { MobileStandardConsumptionsFab } from "./MobileStandardConsumptionsFab";
import { MobileStandardConsumptionsEmptyState } from "./MobileStandardConsumptionsEmptyState";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/standard-consumptions — mobile standard consumption benchmarks.
 * Defines how much of a material SHOULD be consumed per unit of work.
 */
export default function MobileStandardConsumptionsPage() {
  return (
    <MobileListPage managePerm={PERM.INVENTORY_MANAGE}>
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const canCreate = actions?.canCreateStandardConsumption ?? canManage;
        const [benchmarks, materials, categories] = await Promise.all([
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
          canManage
            ? prisma.materialCategory.findMany({
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
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              <MobileStatCard label="Benchmarks" value={String(benchmarks.length)} icon={Beaker} />
              <MobileStatCard label="Work Types" value={String(workTypes.length)} icon={Beaker} tone="neutral" />
            </div>

            <MobileStandardConsumptionsList
              items={serialized}
              exportTitle="Standard Consumptions"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={[
                { key: "workType", label: "Work Type" },
                { key: "materialName", label: "Material" },
                { key: "standardQty", label: "Standard Qty" },
                { key: "baseQty", label: "Base Qty" },
                { key: "unitOfMeasure", label: "UOM" },
              ] as MobileColumnSpec[]}
              exportSummary={`${serialized.length} benchmarks · ${workTypes.length} work types`}
            />

            {benchmarks.length === 0 && (
              <MobileStandardConsumptionsEmptyState
                hasMaterials={materialOptions.length > 0}
                canManage={canManage}
                categories={categories}
              />
            )}

            {canCreate && materialOptions.length > 0 && (
              <MobileStandardConsumptionsFab materials={materialOptions} />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
