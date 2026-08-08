import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ClipboardList, Calendar, Cloud, AlertTriangle, TrendingUp, User, Hammer, Users } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileDprDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileDprDetailContent params={params} />
    </Suspense>
  );
}

async function MobileDprDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      materialLines: { include: { material: { select: { name: true, unit: true } } } },
      laborLines: true,
    },
  });

  if (!dpr) {
    return (
      <div>
        <MobileDetailHeader title="DPR" backHref="/m/dprs" />
        <MobileEmptyState icon={ClipboardList} title="DPR not found" />
      </div>
    );
  }

  const canApprove = hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN) || hasPermission(role, PERM.DPR_APPROVE_ADMIN);

  return (
    <div>
      <MobileDetailHeader
        title={`${dpr.project.name} · ${formatDate(dpr.date)}`}
        subtitle={`Progress: ${dpr.progressPct}%`}
        backHref="/m/dprs"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Overview</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Calendar} title="Date" value={formatDate(dpr.date)} />
        <MobileInfoRow icon={ClipboardList} title="Project" value={dpr.project.name} />
        {dpr.weather && <MobileInfoRow icon={Cloud} title="Weather" value={dpr.weather} />}
        <MobileInfoRow icon={User} title="Submitted By" value={dpr.submittedBy?.name ?? "—"} />
        <MobileInfoRow icon={TrendingUp} title="Progress" value={`${dpr.progressPct}%`} />
        {dpr.workType && <MobileInfoRow icon={Hammer} title="Work Type" value={dpr.workType} />}
      </div>

      <MobileSectionTitle>Status</MobileSectionTitle>
      <div className="p-3">
        <MobileStatusBadge status={dpr.approvalStatus} />
      </div>

      {dpr.workSummary && (
        <>
          <MobileSectionTitle>Work Summary</MobileSectionTitle>
          <div className="px-4 pb-2 text-body text-foreground">{dpr.workSummary}</div>
        </>
      )}

      {dpr.blockers && (
        <>
          <MobileSectionTitle>Blockers</MobileSectionTitle>
          <div className="px-4 pb-2 text-body text-danger">{dpr.blockers}</div>
        </>
      )}

      {dpr.tomorrowPlan && (
        <>
          <MobileSectionTitle>Tomorrow&apos;s Plan</MobileSectionTitle>
          <div className="px-4 pb-2 text-body text-muted-foreground">{dpr.tomorrowPlan}</div>
        </>
      )}

      {dpr.materialLines.length > 0 && (
        <>
          <MobileSectionTitle>Materials Consumed</MobileSectionTitle>
          <div>
            {dpr.materialLines.map((ml) => (
              <MobileRow
                key={ml.id}
                icon={Hammer}
                title={ml.material.name}
                subtitle={`${formatNumber(Number(ml.qty))} ${ml.material.unit}`}
              />
            ))}
          </div>
        </>
      )}

      {dpr.laborLines.length > 0 && (
        <>
          <MobileSectionTitle>Labor</MobileSectionTitle>
          <div>
            {dpr.laborLines.map((ll) => (
              <MobileRow
                key={ll.id}
                icon={Users}
                title={ll.workType ?? "Labor"}
                subtitle={`${ll.count} workers · ${ll.hours}h`}
              />
            ))}
          </div>
        </>
      )}

      {dpr.varianceAnalysis && (
        <>
          <MobileSectionTitle>Variance Analysis</MobileSectionTitle>
          <div className="px-4 pb-2">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-caption text-muted-foreground">
              <AlertTriangle className="mb-1 h-4 w-4 text-warning" />
              {typeof dpr.varianceAnalysis === "string"
                ? dpr.varianceAnalysis
                : JSON.stringify(dpr.varianceAnalysis)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
