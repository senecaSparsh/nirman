import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Building2, Home, ClipboardList, Truck, Wallet } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileRow,
  MobileInfoRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

/**
 * /m/projects/[id] — project detail: budget, units, recent POs/issues/costs.
 */
export default function MobileProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileProjectDetailContent params={params} />
    </Suspense>
  );
}

async function MobileProjectDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });

  if (!project) {
    return (
      <div>
        <MobileDetailHeader title="Project" backHref="/m/projects" right={<MobileRefreshButton />} />
        <MobileEmptyState icon={Building2} title="Project not found" />
      </div>
    );
  }

  const [units, recentPOs, recentIssues, recentCosts] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { unitNumber: "asc" },
      take: 30,
      select: { id: true, unitNumber: true, unitType: true, status: true, area: true, areaUnit: true, askingPrice: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.materialIssue.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { fromLocation: { select: { name: true } } },
    }),
    prisma.projectCost.findMany({
      where: { projectId: id },
      orderBy: { date: "desc" },
      take: 5,
      select: { id: true, costType: true, amount: true, date: true, vendor: true },
    }),
  ]);

  const availableUnits = units.filter((u) => u.status === "AVAILABLE" || u.status === "PLANNED" || u.status === "UNDER_CONSTRUCTION");
  const soldUnits = units.filter((u) => u.status === "SOLD");

  return (
    <div>
      <MobileDetailHeader
        title={project.name}
        subtitle={project.type.replace(/_/g, " ").toLowerCase()}
        backHref="/m/projects"
        right={
          <div className="flex items-center gap-1">
            <MobileStatusBadge status={project.status} />
            <MobileRefreshButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Units" value={formatNumber(units.length, 0)} hint={`${availableUnits.length} available`} icon={Home} />
        <MobileStatCard label="Sold" value={formatNumber(soldUnits.length, 0)} icon={Home} tone="success" />
        <MobileStatCard label="Project Cost" value={project.totalProjectCost ? formatCurrency(toNum(project.totalProjectCost)) : "—"} icon={Wallet} />
        <MobileStatCard label="Cost/Sq.Ft" value={project.costPerSqft ? formatCurrency(toNum(project.costPerSqft)) : "—"} icon={Wallet} />
      </div>

      <MobileSectionTitle>Budget & Timeline</MobileSectionTitle>
      <div>
        <MobileInfoRow title="Total budget" value={project.totalBudget ? formatCurrency(toNum(project.totalBudget)) : "—"} />
        <MobileInfoRow title="Sellable area" value={project.totalSellableArea ? `${formatNumber(toNum(project.totalSellableArea), 0)} Sq.Ft` : "—"} />
        {project.startDate && <MobileInfoRow title="Start" value={formatDate(project.startDate)} />}
        {project.endDate && <MobileInfoRow title="End" value={formatDate(project.endDate)} />}
      </div>

      <MobileSectionTitle>Units ({units.length})</MobileSectionTitle>
      {units.length === 0 ? (
        <MobileEmptyState icon={Home} title="No units" hint="Units show here once created" />
      ) : (
        <div>
          {units.map((u) => (
            <MobileRow
              key={u.id}
              href={`/m/units/${u.id}`}
              icon={Home}
              title={`${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`}
              subtitle={`${formatNumber(toNum(u.area), 0)} ${u.areaUnit}`}
              meta={u.askingPrice ? formatCurrency(toNum(u.askingPrice)) : undefined}
              badge={<MobileStatusBadge status={u.status} />}
            />
          ))}
        </div>
      )}

      {recentPOs.length > 0 && (
        <>
          <MobileSectionTitle>Recent POs</MobileSectionTitle>
          <div>
            {recentPOs.map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/procurement/${po.id}`}
                icon={Truck}
                title={po.supplier.name}
                subtitle={`PO ${po.poNumber} · ${formatDate(po.createdAt)}`}
                badge={<MobileStatusBadge status={po.status} />}
              />
            ))}
          </div>
        </>
      )}

      {recentIssues.length > 0 && (
        <>
          <MobileSectionTitle>Recent Issues</MobileSectionTitle>
          <div>
            {recentIssues.map((i) => (
              <MobileInfoRow
                key={i.id}
                icon={ClipboardList}
                title={i.fromLocation?.name ?? "—"}
                value={i.issueNumber ? `${i.issueNumber} · ${formatDate(i.createdAt)}` : formatDate(i.createdAt)}
              />
            ))}
          </div>
        </>
      )}

      {recentCosts.length > 0 && (
        <>
          <MobileSectionTitle>Recent Costs</MobileSectionTitle>
          <div>
            {recentCosts.map((c) => (
              <MobileInfoRow
                key={c.id}
                icon={Wallet}
                title={`${c.costType} · ${c.vendor ?? "—"}`}
                value={formatCurrency(toNum(c.amount))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
