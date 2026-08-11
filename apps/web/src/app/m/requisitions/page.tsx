import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ClipboardList, Plus } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import { hasPermission, PERM } from "@/lib/roles";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileFab,
} from "@/components/mobile/mobile-primitives";
import { MobileRequisitionsList } from "./MobileRequisitionsList";

/**
 * /m/requisitions — mobile requisition list, grouped by status.
 * Replaces every desktop `/requisitions` link from the mobile surface.
 */
export default function MobileRequisitionsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileRequisitionsContent />
    </Suspense>
  );
}

async function MobileRequisitionsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  const reqs = await prisma.materialRequisition.findMany({
    where: { project: { companyId: company.id } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      project: { select: { name: true } },
      lines: { select: { qtyRequested: true } },
    },
  });

  const byStatus = (s: string) => reqs.filter((r) => r.status === s);
  const submitted = byStatus("SUBMITTED");
  const drafts = byStatus("DRAFT");
  const approved = byStatus("APPROVED");
  const rejected = byStatus("REJECTED");
  const converted = byStatus("CONVERTED");

  // Serialize for the client component (search + filter chips + badges)
  const serialized = reqs.map((r) => ({
    id: r.id,
    reqNumber: r.reqNumber,
    status: r.status,
    projectName: r.project?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    lineCount: r.lines.length,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Requisitions"
        subtitle={`${reqs.length} total · ${submitted.length} awaiting approval`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Submitted" value={formatNumber(submitted.length, 0)} icon={ClipboardList} tone={submitted.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Draft" value={formatNumber(drafts.length, 0)} icon={ClipboardList} />
        <MobileStatCard label="Approved" value={formatNumber(approved.length, 0)} icon={ClipboardList} />
        <MobileStatCard label="Converted" value={formatNumber(converted.length, 0)} icon={ClipboardList} />
      </div>

      <MobileRequisitionsList items={serialized} />

      {reqs.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState
            icon={ClipboardList}
            title="No requisitions"
            hint="Create requisitions from the desktop Requisitions section"
          />
        </>
      )}

      {canCreate && <MobileFab href="/requisitions" icon={Plus} label="New Req" />}
    </div>
  );
}
