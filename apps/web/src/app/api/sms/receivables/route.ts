import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sms/receivables — open receivables an unmatched bank SMS can be
 * linked to. Returns tappable rows for the mobile match sheet — no raw IDs.
 *
 * Sources:
 *   - Asset sales (property/unit sales) not fully paid
 *   - Material sales not fully paid
 *   - Tenancies with PENDING/OVERDUE rent
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();

  const [assetSales, materialSales, pendingRents] = await Promise.all([
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: { not: "CANCELLED" }, paymentStatus: { not: "PAID" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        saleNumber: true,
        salePrice: true,
        gstAmount: true,
        customer: { select: { name: true } },
        payments: { where: { status: "RECEIVED" }, select: { amount: true } },
      },
    }),
    prisma.materialSale.findMany({
      where: { companyId: company.id, status: { not: "CANCELLED" }, paymentStatus: { not: "PAID" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        saleNumber: true,
        totalAmount: true,
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
    prisma.rentalPayment.findMany({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        tenancy: { companyId: company.id },
      },
      orderBy: { dueDate: "asc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        dueDate: true,
        tenancy: { select: { id: true, tenantName: true } },
      },
    }),
  ]);

  const items: { entityType: "ASSET_SALE" | "MATERIAL_SALE" | "TENANCY"; entityId: string; label: string; sublabel: string; due: number }[] = [];

  for (const s of assetSales) {
    const total = toNum(s.salePrice) + toNum(s.gstAmount);
    const paid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const due = Math.max(0, total - paid);
    if (due <= 0) continue;
    items.push({
      entityType: "ASSET_SALE",
      entityId: s.id,
      label: s.saleNumber,
      sublabel: s.customer.name,
      due,
    });
  }

  for (const s of materialSales) {
    const paid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const due = Math.max(0, toNum(s.totalAmount) - paid);
    if (due <= 0) continue;
    items.push({
      entityType: "MATERIAL_SALE",
      entityId: s.id,
      label: s.saleNumber,
      sublabel: s.customer.name,
      due,
    });
  }

  // Deduplicate tenancies — multiple pending rent rows map to the same target.
  const seenTenancy = new Set<string>();
  for (const r of pendingRents) {
    if (seenTenancy.has(r.tenancy.id)) continue;
    seenTenancy.add(r.tenancy.id);
    items.push({
      entityType: "TENANCY",
      entityId: r.tenancy.id,
      label: `Rent — ${r.tenancy.tenantName}`,
      sublabel: `due ${r.dueDate.toISOString().slice(0, 10)}`,
      due: toNum(r.amount),
    });
  }

  return json({ items });
});
