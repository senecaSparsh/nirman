import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PermissionsView, type PermissionRow } from "@/components/legal/permissions-view";

export const metadata = { title: "Permissions & Legal — Nirman" };

export default function PermissionsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading permissions…" variant="cards" />}>
        <PermissionsContent />
      </Suspense>
    </div>
  );
}

async function PermissionsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="permissions & legal documents" />;
  }

  const canManage = hasPermission(role, PERM.LEGAL_MANAGE);

  // Fetch all legal documents for this company, with project + land names
  const docs = await prisma.legalDocument.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, name: true } },
      landPurchase: { select: { id: true, sellerName: true, location: true } },
    },
  });

  const rows: PermissionRow[] = docs.map((d) => ({
    id: d.id,
    landPurchaseId: d.landPurchaseId,
    projectId: d.projectId,
    type: d.type,
    title: d.title,
    authority: d.authority,
    status: d.status,
    appliesTo: d.appliesTo,
    docNumber: d.docNumber,
    sortOrder: d.sortOrder,
    prerequisiteType: d.prerequisiteType,
    obtained: d.obtained,
    applicationDate: d.applicationDate?.toISOString() ?? null,
    issueDate: d.issueDate?.toISOString() ?? null,
    validFrom: d.validFrom?.toISOString() ?? null,
    validTill: d.validTill?.toISOString() ?? null,
    amount: d.amount ? toNum(d.amount) : null,
    expectedRegistryDate: d.expectedRegistryDate?.toISOString() ?? null,
    documentUrl: d.documentUrl,
    documentName: d.documentName,
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
    projectName: d.project?.name ?? null,
    landSellerName: d.landPurchase?.sellerName ?? null,
    landLocation: d.landPurchase?.location ?? null,
  }));

  return <PermissionsView docs={rows} canManage={canManage} />;
}
