import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSaleDetailClient } from "./MobileSaleDetailClient";

export default function MobileSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSaleDetailContent params={params} />
    </Suspense>
  );
}

async function MobileSaleDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const sale = await prisma.assetSale.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      builtUnit: { select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, projectId: true } },
      payments: {
        orderBy: { paymentDate: "desc" },
        select: {
          id: true, amount: true, paymentDate: true,
          mode: true, reference: true, status: true,
        },
      },
    },
  });

  // AssetSale has no landParcel relation (only landParcelId) — fetch separately.
  const landParcel = sale?.landParcelId
    ? await prisma.landParcel.findFirst({
        where: { id: sale.landParcelId, deletedAt: null },
        select: { id: true, number: true, area: true, areaUnit: true },
      })
    : null;

  if (!sale) {
    return (
      <MobileSaleDetailClient
        notFound
        saleId={id}
        saleNumber=""
        assetType="BUILT_UNIT"
        status="ACTIVE"
        saleStage="PENDING"
        paymentStatus="PENDING"
        saleDate=""
        salePrice={0}
        gstRate={0}
        gstAmount={0}
        costBasis={0}
        profit={0}
        depositAmount={null}
        depositDate={null}
        finalSaleDate={null}
        paymentMode={null}
        notes={null}
        totalPaid={0}
        customer={null}
        project={null}
        asset={null}
        payments={[]}
        canManage={false}
      />
    );
  }

  const canManage = hasPermission(role, PERM.SALES_MANAGE);
  const totalPaid = sale.payments.reduce((sum, p) => sum + toNum(p.amount), 0);

  const asset = sale.assetType === "LAND"
    ? landParcel
      ? {
          type: "LAND" as const,
          id: landParcel.id,
          label: `Parcel ${landParcel.number}`,
          area: toNum(landParcel.area),
          areaUnit: landParcel.areaUnit,
        }
      : null
    : sale.builtUnit
      ? {
          type: "BUILT_UNIT" as const,
          id: sale.builtUnit.id,
          label: sale.builtUnit.unitNumber,
          unitType: sale.builtUnit.unitType,
          area: toNum(sale.builtUnit.area),
          areaUnit: sale.builtUnit.areaUnit,
        }
      : null;

  return (
    <MobileSaleDetailClient
      saleId={sale.id}
      saleNumber={sale.saleNumber}
      assetType={sale.assetType}
      status={sale.status}
      saleStage={sale.saleStage}
      paymentStatus={sale.paymentStatus}
      saleDate={sale.saleDate.toISOString()}
      salePrice={toNum(sale.salePrice)}
      gstRate={toNum(sale.gstRate)}
      gstAmount={toNum(sale.gstAmount)}
      costBasis={toNum(sale.costBasis)}
      profit={toNum(sale.profit)}
      depositAmount={sale.depositAmount ? toNum(sale.depositAmount) : null}
      depositDate={sale.depositDate ? sale.depositDate.toISOString() : null}
      finalSaleDate={sale.finalSaleDate ? sale.finalSaleDate.toISOString() : null}
      paymentMode={sale.paymentMode}
      notes={sale.notes}
      totalPaid={totalPaid}
      customer={sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null}
      project={sale.project ? { id: sale.project.id, name: sale.project.name } : null}
      asset={asset}
      payments={sale.payments.map((p) => ({
        id: p.id,
        amount: toNum(p.amount),
        paymentDate: p.paymentDate.toISOString(),
        mode: p.mode,
        reference: p.reference,
        status: p.status,
      }))}
      canManage={canManage}
    />
  );
}
