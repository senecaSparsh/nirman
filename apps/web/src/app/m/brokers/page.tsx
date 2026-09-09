import { prisma } from "@nirman/db";
import { toNum, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileBrokersList, type BrokerListItem } from "./MobileBrokersList";

/**
 * /m/brokers — mobile broker directory. Shows broker name, agency,
 * phone, default commission %, and deal count so sales managers can
 * find and manage brokers on the go.
 */
export default function MobileBrokersPage() {
  return (
    <MobileListPage managePerm={PERM.SALE_CREATE}>
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const canCreate = actions?.canCreateBroker ?? canManage;
        const brokers = await prisma.broker.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          take: 100,
          include: {
            _count: { select: { assetSales: true } },
          },
        });

        const rows: BrokerListItem[] = brokers.map((b) => ({
          id: b.id,
          name: b.name,
          phone: b.phone ?? null,
          agency: b.agency ?? null,
          defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null,
          notes: b.notes ?? null,
          dealCount: b._count.assetSales,
        }));

        return (
          <MobileBrokersList
            items={rows}
            canCreate={canCreate}
            canEdit={canCreate}
            canDelete={canCreate}
          />
        );
      }}
    </MobileListPage>
  );
}
