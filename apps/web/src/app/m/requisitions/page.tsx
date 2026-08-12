import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileRequisitionsList } from "./MobileRequisitionsList";

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
      vendorQuotes: { select: { id: true } },
      requestedBy: { select: { name: true } },
    },
  });

  const serialized = reqs.map((r) => ({
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

  return (
    <div>
      <MobileRequisitionsList items={serialized} canCreate={canCreate} />
    </div>
  );
}
