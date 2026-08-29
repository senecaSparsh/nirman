import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileRequisitionsList } from "./MobileRequisitionsList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileFab } from "@/components/mobile/v2/scaffold";

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

  const BATCH_SIZE = 60;
  const reqs = await prisma.materialRequisition.findMany({
    where: { project: { companyId: company.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: BATCH_SIZE + 1,
    include: {
      project: { select: { name: true } },
      lines: { select: { qtyRequested: true } },
      vendorQuotes: { select: { id: true } },
      requestedBy: { select: { name: true } },
    },
  });

  const hasMore = reqs.length > BATCH_SIZE;
  const batch = hasMore ? reqs.slice(0, BATCH_SIZE) : reqs;
  const lastItem = batch[batch.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
    : null;

  const serialized = batch.map((r) => ({
    id: r.id,
    reqNumber: r.reqNumber,
    status: r.status,
    projectName: r.project?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    neededByDate: r.neededByDate?.toISOString() ?? null,
    lineCount: r.lines.length,
    quoteCount: r.vendorQuotes.length,
    minQuotesRequired: r.minQuotesRequired,
    quotesWaived: r.quotesWaived,
    convertedToPo: !!r.convertedPoId,
    rejectReason: r.rejectReason ?? null,
    requestedByName: r.requestedBy?.name ?? null,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "reqNumber", label: "Requisition #" },
    { key: "projectName", label: "Project" },
    { key: "status", label: "Status" },
    { key: "lineCount", label: "Total Items" },
    { key: "createdAt", label: "Created Date", format: "date" },
    { key: "neededByDate", label: "Needed By", format: "date" },
    { key: "requestedByName", label: "Requested By" },
  ];

  return (
    <div>
      <MobileRequisitionsList
        items={serialized}
        canCreate={canCreate}
        loadMoreUrl="/api/mobile/list/requisitions"
        nextCursor={nextCursor}
        exportTitle="Material Requisitions"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={csvColumns}
        exportSummary={`${serialized.length} requisitions`}
      />
      {canCreate && (
        <MobileFab href="/m/requisitions/new" label="New requisition" />
      )}
    </div>
  );
}
