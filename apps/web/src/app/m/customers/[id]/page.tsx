import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { MobileCustomerDetailClient } from "./MobileCustomerDetailClient";

/**
 * /m/customers/[id] — customer detail.
 *
 * Purpose: a salesperson/manager opens this to see who the customer is,
 * what they've bought (land, units, materials), what they owe, and to
 * take action — call them, start a new sale, or record a payment.
 *
 * This is a CRM record + financial summary combined. The customer is
 * the anchor; their sales and payments radiate from here.
 */
export default function MobileCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading customer…" />}>
      <MobileCustomerDetailContent params={params} />
    </Suspense>
  );
}

async function MobileCustomerDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const canSell = hasPermission(role, PERM.SALE_CREATE);
  const canManage = hasPermission(role, PERM.SALES_MANAGE);

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      assetSales: {
        where: { companyId: company.id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { id: true, name: true } },
          payments: { orderBy: { paymentDate: "asc" } },
        },
      },
      materialSales: {
        where: { companyId: company.id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { id: true, name: true } },
          payments: { orderBy: { paymentDate: "asc" } },
        },
      },
    },
  });

  if (!customer) {
    return (
      <MobileCustomerDetailClient notFound canSell={canSell} canManage={canManage} />
    );
  }

  // ── Asset sales (land + built units) ──
  const assetSales = customer.assetSales.map((s) => {
    const paid = s.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
    const totalWithGst = toNum(s.salePrice) + toNum(s.gstAmount);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      type: "ASSET" as const,
      assetType: s.assetType,
      salePrice: toNum(s.salePrice),
      gstAmount: toNum(s.gstAmount),
      totalWithGst,
      paid,
      balance: totalWithGst - paid,
      saleDate: s.saleDate.toISOString(),
      saleStage: s.saleStage,
      paymentStatus: s.paymentStatus,
      projectName: s.project.name,
    };
  });

  // ── Material sales (raw materials / scrap) ──
  const materialSales = customer.materialSales.map((s) => {
    const paid = s.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
    const totalWithGst = toNum(s.totalAmount);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      type: "MATERIAL" as const,
      salePrice: toNum(s.subtotal),
      gstAmount: toNum(s.gstTotal),
      totalWithGst,
      paid,
      balance: totalWithGst - paid,
      saleDate: s.saleDate.toISOString(),
      saleStage: s.status, // ACTIVE/CANCELLED
      paymentStatus: s.paymentStatus,
      projectName: s.project?.name ?? null,
    };
  });

  const allSales = [...assetSales, ...materialSales].sort(
    (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime(),
  );

  const totalValue = allSales.reduce((s, sale) => s + sale.totalWithGst, 0);
  const totalPaid = allSales.reduce((s, sale) => s + sale.paid, 0);
  const totalOutstanding = allSales.reduce((s, sale) => s + sale.balance, 0);
  const activeDeals = allSales.filter((s) => s.saleStage !== "COMPLETED" && s.saleStage !== "CANCELLED").length;

  const data = {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    gstin: customer.gstin,
    address: customer.address,
    createdAt: customer.createdAt.toISOString(),
    sales: allSales,
    totals: {
      totalValue,
      totalPaid,
      totalOutstanding,
      activeDeals,
      saleCount: allSales.length,
    },
  };

  return (
    <MobileCustomerDetailClient
      data={data}
      canSell={canSell}
      canManage={canManage}
    />
  );
}
