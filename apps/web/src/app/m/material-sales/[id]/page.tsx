import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileMaterialSaleDetailClient } from "./MobileMaterialSaleDetailClient";

export default function MobileMaterialSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileMaterialSaleDetailContent params={params} />
    </Suspense>
  );
}

async function MobileMaterialSaleDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const sale = await prisma.materialSale.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, name: true, unit: true, code: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        select: {
          id: true, amount: true, paymentDate: true,
          paymentMode: true, referenceNo: true,
        },
      },
    },
  });

  if (!sale) {
    return (
      <MobileMaterialSaleDetailClient
        notFound
        saleId={id}
        saleNumber=""
        status="ACTIVE"
        paymentStatus="PENDING"
        saleDate=""
        subtotal={0}
        gstTotal={0}
        totalAmount={0}
        totalCost={0}
        grossProfit={0}
        scrapSubtotal={0}
        paymentMode={null}
        notes={null}
        customer={null}
        project={null}
        lines={[]}
        payments={[]}
        canManage={false}
      />
    );
  }

  const canManage = hasPermission(role, PERM.SALES_MANAGE);

  return (
    <MobileMaterialSaleDetailClient
      saleId={sale.id}
      saleNumber={sale.saleNumber}
      status={sale.status}
      paymentStatus={sale.paymentStatus}
      saleDate={sale.saleDate.toISOString()}
      subtotal={toNum(sale.subtotal)}
      gstTotal={toNum(sale.gstTotal)}
      totalAmount={toNum(sale.totalAmount)}
      totalCost={toNum(sale.totalCost)}
      grossProfit={toNum(sale.grossProfit)}
      scrapSubtotal={toNum(sale.scrapSubtotal)}
      paymentMode={sale.paymentMode}
      notes={sale.notes}
      customer={sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null}
      project={sale.project ? { id: sale.project.id, name: sale.project.name } : null}
      lines={sale.lines.map((l) => ({
        id: l.id,
        materialId: l.material.id,
        materialName: l.material.name,
        materialCode: l.material.code,
        materialUnit: l.material.unit,
        locationId: l.location.id,
        locationName: l.location.name,
        qty: toNum(l.qty),
        unitPrice: toNum(l.unitPrice),
        unitCost: toNum(l.unitCost),
        gstRate: toNum(l.gstRate),
        gstAmount: toNum(l.gstAmount),
        lineTotal: toNum(l.lineTotal),
      }))}
      payments={sale.payments.map((p) => ({
        id: p.id,
        amount: toNum(p.amount),
        paymentDate: p.paymentDate.toISOString(),
        paymentMode: p.paymentMode,
        referenceNo: p.referenceNo,
      }))}
      canManage={canManage}
    />
  );
}
