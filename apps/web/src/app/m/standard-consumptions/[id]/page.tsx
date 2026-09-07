import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import {
  DetailHeroCard,
  DetailStatGrid,
} from "@/components/mobile/v2/detail-primitives";
import { Beaker, Package, Ruler } from "lucide-react";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileStandardConsumptionActions } from "./MobileStandardConsumptionActions";

export const metadata = { title: "Standard Consumption — Nirman" };

export default function MobileStandardConsumptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} perm={PERM.INVENTORY_VIEW} what="standard consumption details" permission={PERM.INVENTORY_VIEW} managePerm={PERM.INVENTORY_MANAGE} skeletonSections={3}>
      {async ({ id, company, role, canManage }) => {
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
          <PageContextProvider value={{
            entityType: "standard-consumption",
            label: sc.material.name,
            subtitle: sc.workType,
            recordId: sc.id,
          }}>
          <div className="flex flex-col gap-4 pb-6">
            {/* Header card */}
            <DetailHeroCard
              icon={Beaker}
              title={sc.material.name}
              subtitle={sc.material.code ? `${sc.material.code} · ${sc.unitOfMeasure}` : sc.unitOfMeasure}
            >
              <p className="text-m-label font-bold uppercase tracking-wide mt-2" style={{ color: "var(--color-ink-500)" }}>
                {sc.workType}
              </p>
              {sc.notes && (
                <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
                  {sc.notes}
                </p>
              )}
            </DetailHeroCard>

            {/* Summary stats */}
            <div>
              <SectionHead title="Benchmark Summary" />
              <DetailStatGrid
                cols={4}
                stats={[
                  { label: "Standard Qty", value: `${formatNumber(standardQty, 3)} ${sc.material.unit}`, icon: Package, tone: "go" },
                  { label: "Base Qty", value: formatNumber(baseQty, 3), icon: Ruler },
                  { label: "Per Unit", value: `${formatNumber(perUnitQty, 5)} ${sc.material.unit}`, icon: Beaker, tone: "signal" },
                ]}
              />
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
            {canManage ? (
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
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
