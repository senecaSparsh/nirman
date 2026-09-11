import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobilePettyCashList, type PettyCashFloatListItem } from "./MobilePettyCashList";
import { MobileFab } from "@/components/mobile/v2/scaffold";

/**
 * /m/petty-cash — mobile petty cash float list. Shows cash floats
 * with current balance and custodian so site staff can track cash.
 */
export default function MobilePettyCashPage() {
  return (
    <MobileListPage managePerm={PERM.FINANCE_MANAGE} skeletonRows={4}>
      {async ({ company, canManage }) => {
        const floats = await prisma.pettyCashFloat.findMany({
          where: {...await scopeWhere("PettyCashFloat"),  companyId: company.id },
          orderBy: { name: "asc" },
          include: {
            project: { select: { id: true, name: true } },
            custodian: { select: { id: true, name: true } },
            topUps: { orderBy: { date: "desc" }, take: 5 },
          },
        });

        const rows: PettyCashFloatListItem[] = floats.map((f) => ({
          id: f.id,
          name: f.name,
          projectName: f.project?.name ?? null,
          custodianName: f.custodian?.name ?? null,
          floatAmount: toNum(f.floatAmount),
          topUpTotal: toNum(f.topUpTotal),
          spentTotal: toNum(f.spentTotal),
          topUpCount: f.topUps.length,
          lastTopUpDate: f.topUps[0]?.date.toISOString() ?? null,
        }));

        const totalBalance = rows.reduce((s, f) => s + f.floatAmount + (f.topUpTotal || 0) - (f.spentTotal || 0), 0);
        const totalTopUps = rows.reduce((s, f) => s + f.topUpTotal, 0);

        return (
          <>
            <MobilePettyCashList
              items={rows}
              totalBalance={totalBalance}
              totalTopUps={totalTopUps}
              canManage={canManage}
            />
            {canManage && <MobileFab href="/m/petty-cash/new" label="Add float" />}
          </>
        );
      }}
    </MobileListPage>
  );
}
