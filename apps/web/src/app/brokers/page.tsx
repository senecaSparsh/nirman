import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { BrokersView } from "@/components/brokers/brokers-view";
import { NoAccess } from "@/components/no-access";
import { formatCurrency } from "@/lib/utils";
import type { BrokerRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const role = await getUserRole();
  if (!hasPermission(role, PERM.SALES_VIEW)) return <NoAccess />;

  const company = await getCompany();

  const brokers = await prisma.broker.findMany({
    take: 500,
    where: { deletedAt: null, companyId: company.id },
    orderBy: { name: "asc" },
    include: {
      assetSales: {
        where: { dealSource: "BROKER" },
        select: { commissionAmount: true, commissionPaid: true },
      },
    },
  });

  const rows: BrokerRow[] = brokers.map((b) => {
    const brokerDeals = b.assetSales;
    const totalCommission = brokerDeals.reduce((s, d) => s + toNum(d.commissionAmount ?? 0), 0);
    const commissionPaid = brokerDeals.filter((d) => d.commissionPaid).reduce((s, d) => s + toNum(d.commissionAmount ?? 0), 0);
    return {
      id: b.id,
      name: b.name,
      phone: b.phone,
      agency: b.agency,
      defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null,
      notes: b.notes,
      dealCount: brokerDeals.length,
      totalCommission,
      commissionPaid,
    };
  });

  const totalDeals = rows.reduce((s, b) => s + b.dealCount, 0);
  const totalCommission = rows.reduce((s, b) => s + b.totalCommission, 0);
  const totalUnpaid = rows.reduce((s, b) => s + (b.totalCommission - b.commissionPaid), 0);

  const perms = {
    canCreate: hasPermission(role, PERM.SALE_CREATE),
    canEdit: hasPermission(role, PERM.SALE_CREATE),
    canDelete: hasPermission(role, PERM.SALE_CREATE),
  };

  return (
    <>
      <PageHeader
        title="Brokers"
        description="Real estate brokers and agents — track default commission %, contact info, and deal history."
        stats={[
          { label: "Brokers", value: rows.length, hint: "Total brokers in your network." },
          { label: "Deals", value: totalDeals, hint: "Total deals sourced through brokers." },
          { label: "Commission", value: formatCurrency(totalCommission), hint: `Total commission across all broker deals. ${formatCurrency(totalUnpaid)} unpaid.` },
        ]}
      />
      <BrokersView
        brokers={rows}
        canCreate={perms.canCreate}
        canEdit={perms.canEdit}
        canDelete={perms.canDelete}
      />
    </>
  );
}
