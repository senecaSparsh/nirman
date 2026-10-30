import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { SubcontractorsView } from "@/components/subcontractors/subcontractors-view";
import { NoAccess } from "@/components/no-access";
import { formatCurrency } from "@/lib/utils";
import type { SubcontractorRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SubcontractorsPage() {
  const __effPerms = await getUserPermissions();
  if (!__effPerms.includes(PERM.PROCUREMENT_VIEW)) return <NoAccess permission={PERM.PROCUREMENT_VIEW} />;

  const company = await getCompany();

  const subcontractorsAll = await prisma.subcontractor.findMany({
    take: LIST_CAP + 1,
    where: { deletedAt: null, companyId: company.id },
    orderBy: { name: "asc" },
    include: {
      workOrders: {
        select: { id: true, status: true, totalWorkDone: true, totalPaid: true, retentionBalance: true },
      },
    },
  });
  const { rows: subcontractors, capped } = applyCap(subcontractorsAll);
  const cappedLabels = capped ? ["subcontractors"] : [];

  const rows: SubcontractorRow[] = subcontractors.map((s) => {
    const activeStatuses = ["DRAFT", "ISSUED", "ACTIVE"];
    return {
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      phone: s.phone,
      email: s.email,
      address: s.address,
      trade: s.trade,
      workOrderCount: s.workOrders.length,
      activeWorkOrderCount: s.workOrders.filter((w) => activeStatuses.includes(w.status)).length,
      totalWorkDone: s.workOrders.reduce((sum, w) => sum + toNum(w.totalWorkDone), 0),
      totalPaid: s.workOrders.reduce((sum, w) => sum + toNum(w.totalPaid), 0),
      retentionBalance: s.workOrders.reduce((sum, w) => sum + toNum(w.retentionBalance), 0),
    };
  });

  const totalWorkDone = rows.reduce((s, r) => s + toNum((r.totalWorkDone ?? 0)), 0);
  const totalPaid = rows.reduce((s, r) => s + toNum((r.totalPaid ?? 0)), 0);
  const totalRetention = rows.reduce((s, r) => s + toNum((r.retentionBalance ?? 0)), 0);

  const perms = {
    canCreate: __effPerms.includes(PERM.PROCUREMENT_MANAGE),
    canEdit: __effPerms.includes(PERM.PROCUREMENT_MANAGE),
    canDelete: __effPerms.includes(PERM.PROCUREMENT_MANAGE),
  };

  return (
    <>
      <PageHeader
        title="Contractors (Thekedar)"
        description="Thekedar master — trades, contact, work order history, and financial summary."
        stats={[
          { label: "Contractors", value: rows.length, hint: "Total thekedars in your network." },
          { label: "Work Done", value: formatCurrency(totalWorkDone), hint: "Total work done across all contractors." },
          { label: "Retention Held", value: formatCurrency(totalRetention), hint: `Total retention held. ${formatCurrency(totalPaid)} paid out.` },
        ]}
      />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <SubcontractorsView
        subcontractors={rows}
        canCreate={perms.canCreate}
        canEdit={perms.canEdit}
        canDelete={perms.canDelete}
      />
    </>
  );
}
