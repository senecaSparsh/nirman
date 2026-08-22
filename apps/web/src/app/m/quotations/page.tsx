import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCompanyGroupIds, getUserRole, getCurrentUserMembership, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileQuotationsList } from "./MobileQuotationsList";

export default function MobileQuotationsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileQuotationsContent />
    </Suspense>
  );
}

async function MobileQuotationsContent() {
  await connection();
  const company = await getCompany();
  const groupCompanyIds = await getCompanyGroupIds(company);
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.QUOTATION_MANAGE);
  const membership = await getCurrentUserMembership();

  const [requests, projects, materials] = await Promise.all([
    prisma.quotationRequest.findMany({
      where: { companyId: { in: groupCompanyIds } },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        lines: { select: { id: true, qtyRequired: true, materialId: true } },
        quotes: {
          where: { status: { not: "REJECTED" } },
          select: { id: true, landedTotal: true, status: true, supplierId: true, isCheapest: true },
        },
        convertedPo: { select: { id: true, poNumber: true, status: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true, unit: true, hsnCode: true, gstRate: true },
      orderBy: { name: "asc" },
    }),
  ]);

  let pendingIds = new Set<string>();
  if (membership) {
    const directReports = await prisma.userCompany.findMany({
      where: { reportsToUserCompanyId: membership.id },
      select: { id: true },
    });
    const reportIds = new Set(directReports.map((r) => r.id));
    pendingIds = new Set(
      requests
        .filter((r) => reportIds.has(r.submittedByUserCompanyId))
        .map((r) => r.id),
    );
  }

  const serialized = requests.map((r) => {
    const quotes = r.quotes;
    const cheapest = quotes.find((q) => q.isCheapest);
    return {
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      status: r.status,
      projectName: r.project?.name ?? null,
      projectId: r.project?.id ?? null,
      submittedByName: r.submittedBy?.name ?? "—",
      createdAt: r.createdAt.toISOString(),
      lineCount: r.lines.length,
      quoteCount: quotes.length,
      minQuotesRequired: r.minQuotesRequired,
      quotesMet: quotes.length >= r.minQuotesRequired,
      selectedQuoteId: r.selectedQuoteId ?? null,
      cheapestLandedTotal: cheapest ? toNum(cheapest.landedTotal) : null,
      isPendingMyApproval: pendingIds.has(r.id),
      convertedPo: r.convertedPo
        ? { id: r.convertedPo.id, poNumber: r.convertedPo.poNumber, status: r.convertedPo.status }
        : null,
    };
  });

  const catalog = {
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      unit: m.unit,
      hsnCode: m.hsnCode,
      gstRate: m.gstRate.toNumber(),
    })),
  };

  return (
    <div>
      <MobileQuotationsList items={serialized} canCreate={canCreate} catalog={catalog} />
    </div>
  );
}
