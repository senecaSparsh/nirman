import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { BrokersView } from "@/components/brokers/brokers-view";
import { NoAccess } from "@/components/no-access";
import { formatCurrency } from "@/lib/utils";
import type { BrokerRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const __effPerms = await getUserPermissions();
  if (!__effPerms.includes(PERM.SALES_VIEW)) return <NoAccess permission={PERM.SALES_VIEW} />;

  const company = await getCompany();

  const brokersAll = await prisma.broker.findMany({
    take: LIST_CAP + 1,
    where: { deletedAt: null, companyId: company.id },
    orderBy: { name: "asc" },
    include: {
      assetSales: {
        where: { dealSource: "BROKER" },
        select: { commissionAmount: true, commissionPaid: true },
      },
    },
  });
  const { rows: brokers, capped } = applyCap(brokersAll);
  const cappedLabels = capped ? ["brokers"] : [];

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
  const totalCommission = rows.reduce((s, b) => s + toNum(b.totalCommission), 0);
  const totalUnpaid = rows.reduce((s, b) => s + toNum((b.totalCommission - b.commissionPaid)), 0);

  const perms = {
    canCreate: __effPerms.includes(PERM.SALE_CREATE),
    canEdit: __effPerms.includes(PERM.SALE_CREATE),
    canDelete: __effPerms.includes(PERM.SALE_CREATE),
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
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <BrokersView
        brokers={rows}
        canCreate={perms.canCreate}
        canEdit={perms.canEdit}
        canDelete={perms.canDelete}
      />
    </>
  );
}
