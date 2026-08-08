import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ClipboardList } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileDprsList } from "./MobileDprsList";

/**
 * /m/dprs — mobile DPR list. Replaces desktop `/hr/dprs` leaks.
 * Links to the existing mobile DPR form for today's submission.
 */
export default function MobileDprsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileDprsContent />
    </Suspense>
  );
}

async function MobileDprsContent() {
  await connection();
  const company = await getCompany();

  const dprs = await prisma.dailyProgressReport.findMany({
    where: { project: { companyId: company.id } },
    orderBy: { date: "desc" },
    take: 40,
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
    },
  });

  const byStatus = (s: string) => dprs.filter((d) => d.approvalStatus === s);
  const submitted = byStatus("SUBMITTED");
  const subAdmin = byStatus("SUB_ADMIN_APPROVED");
  const approved = byStatus("APPROVED");
  const rejected = byStatus("REJECTED");
  const pending = submitted.length + subAdmin.length;

  // Serialize for the client component (search + filter chips + badges)
  const serialized = dprs.map((d) => ({
    id: d.id,
    date: d.date.toISOString(),
    projectName: d.project.name,
    projectId: d.project.id,
    submittedByName: d.submittedBy?.name ?? null,
    approvalStatus: d.approvalStatus,
    progressPct: toNum(d.progressPct),
    workType: d.workType ?? null,
  }));

  return (
    <div>
      <MobilePageHeader
        title="DPRs"
        subtitle={`${dprs.length} recent · ${pending} pending`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Pending" value={formatNumber(pending, 0)} icon={ClipboardList} tone={pending > 0 ? "warning" : "default"} />
        <MobileStatCard label="Approved" value={formatNumber(approved.length, 0)} icon={ClipboardList} tone="success" />
        <MobileStatCard label="Sub-Admin" value={formatNumber(subAdmin.length, 0)} icon={ClipboardList} />
        <MobileStatCard label="Rejected" value={formatNumber(rejected.length, 0)} icon={ClipboardList} tone={rejected.length > 0 ? "danger" : "default"} />
      </div>

      <div className="px-4 pb-2">
        <MobileCta href="/m/site/dpr" icon={ClipboardList}>
          Submit today&apos;s DPR
        </MobileCta>
      </div>

      <MobileDprsList items={serialized} />

      {dprs.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState
            icon={ClipboardList}
            title="No DPRs yet"
            hint="Daily progress reports appear here"
          />
        </>
      )}
    </div>
  );
}
