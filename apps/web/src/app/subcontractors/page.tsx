import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SubcontractorsView } from "@/components/subcontractors/subcontractors-view";
import { NoAccess } from "@/components/no-access";
import { formatCurrency } from "@/lib/utils";
import type { SubcontractorRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SubcontractorsPage() {
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) return <NoAccess />;

  const company = await getCompany();

  const subcontractors = await prisma.subcontractor.findMany({
    take: 500,
    where: { deletedAt: null, companyId: company.id },
    orderBy: { name: "asc" },
    include: {
      workOrders: {
        select: { id: true, status: true, totalWorkDone: true, totalPaid: true, retentionBalance: true },
      },
    },
  });

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

  const totalWorkDone = rows.reduce((s, r) => s + (r.totalWorkDone ?? 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r.totalPaid ?? 0), 0);
  const totalRetention = rows.reduce((s, r) => s + (r.retentionBalance ?? 0), 0);

  const perms = {
    canCreate: hasPermission(role, PERM.PROCUREMENT_MANAGE),
    canEdit: hasPermission(role, PERM.PROCUREMENT_MANAGE),
    canDelete: hasPermission(role, PERM.PROCUREMENT_MANAGE),
  };

  return (
    <>
      <PageHeader
        title="Subcontractors"
        description="Subcontractor master — trades, contact info, work order history, and financial summary."
        stats={[
          { label: "Subcontractors", value: rows.length, hint: "Total subcontractors in your network." },
          { label: "Work Done", value: formatCurrency(totalWorkDone), hint: "Total work done across all subcontractors." },
          { label: "Retention Held", value: formatCurrency(totalRetention), hint: `Total retention held. ${formatCurrency(totalPaid)} paid out.` },
        ]}
      />
      <SubcontractorsView
        subcontractors={rows}
        canCreate={perms.canCreate}
        canEdit={perms.canEdit}
        canDelete={perms.canDelete}
      />
    </>
  );
}
