import { Suspense } from "react";
import { Printer } from "lucide-react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobilePipelineStepper, type MobilePipelineStep } from "@/components/mobile/v2/primitives";
import { MobileStockCountDetailClient } from "./MobileStockCountDetailClient";

/**
 * /m/stock-counts/[id] — stock count / physical verification detail.
 * Shows the count header, line items with system vs counted qty and variance,
 * and status. Inline actions (confirm / reconcile) are RBAC-gated by
 * `inventory.manage`.
 */
export default function MobileStockCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileStockCountDetailContent params={params} />
    </Suspense>
  );
}

async function MobileStockCountDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const count = await prisma.stockCount.findFirst({
    where: { id, location: { companyId: company.id, deletedAt: null } },
    include: {
      location: { select: { id: true, name: true, type: true } },
      lines: {
        include: { material: { select: { id: true, name: true, unit: true, code: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!count) {
    return (
      <MobileStockCountDetailClient
        notFound
        canManage={false}
      />
    );
  }

  const totalVariance = count.lines.reduce((s, l) => s + toNum(l.variance), 0);
  const itemsWithVariance = count.lines.filter((l) => {
    const v = toNum(l.variance);
    return v > 0.001 || v < -0.001;
  }).length;
  const itemsMatched = count.lines.length - itemsWithVariance;

  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);

  // Serialize for client component
  const serialized = {
    id: count.id,
    status: count.status,
    countDate: count.countDate.toISOString(),
    createdAt: count.createdAt.toISOString(),
    notes: count.notes,
    location: {
      id: count.location.id,
      name: count.location.name,
      type: count.location.type,
    },
    totalVariance,
    itemsWithVariance,
    itemsMatched,
    lineCount: count.lines.length,
    lines: count.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialName: l.material.name,
      materialCode: l.material.code,
      materialUnit: l.material.unit,
      systemQty: toNum(l.systemQty),
      countedQty: toNum(l.countedQty),
      variance: toNum(l.variance),
    })),
  };

  // Lifecycle pipeline: DRAFT → COUNTED → RECONCILED
  const scPipelineSteps: MobilePipelineStep[] = [
    { label: "Draft", state: count.status === "DRAFT" ? "current" : "done" },
    { label: "Counted", state: count.status === "COUNTED" ? "current" : count.status === "RECONCILED" ? "done" : "pending" },
    { label: "Reconciled", state: count.status === "RECONCILED" ? "current" : "pending" },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <MobilePipelineStepper steps={scPipelineSteps} />
        <a
          href={`/print/stock-counts/${count.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold press shrink-0"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          <Printer className="size-3.5" />
          Print
        </a>
      </div>
      <MobileStockCountDetailClient
        count={serialized}
        canManage={canManage}
      />
    </>
  );
}
