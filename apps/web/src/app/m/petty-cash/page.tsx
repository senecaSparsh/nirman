import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobilePettyCashList, type PettyCashFloatListItem } from "./MobilePettyCashList";

/**
 * /m/petty-cash — mobile petty cash float list. Shows cash floats
 * with current balance and custodian so site staff can track cash.
 */
export default function MobilePettyCashPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={4} />}>
      <MobilePettyCashContent />
    </Suspense>
  );
}

async function MobilePettyCashContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.FINANCE_MANAGE);

  const floats = await prisma.pettyCashFloat.findMany({
    where: { companyId: company.id },
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

  const totalBalance = rows.reduce((s, f) => s + f.floatAmount, 0);
  const totalTopUps = rows.reduce((s, f) => s + f.topUpTotal, 0);

  return (
    <MobilePettyCashList
      items={rows}
      totalBalance={totalBalance}
      totalTopUps={totalTopUps}
      canManage={canManage}
    />
  );
}
