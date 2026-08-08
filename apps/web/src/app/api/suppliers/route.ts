import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, supplierSchema, toNum } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  // Supplier has no companyId — scope to suppliers that have POs in this company.
  const suppliers = await prisma.supplier.findMany({
    where: {
      deletedAt: null,
      purchaseOrders: { some: { companyId: company.id } },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          purchaseOrders: { where: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } },
        },
      },
    },
  });
  return json(
    suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      phone: s.phone,
      email: s.email,
      address: s.address,
      balanceOwed: toNum(s.balanceOwed),
      openPOs: s._count.purchaseOrders,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({ data: parsed.data });
    await logAction(tx, {
      userId: user.id,
      action: "SUPPLIER_CREATE",
      entityType: "Supplier",
      entityId: supplier.id,
      after: { name: supplier.name, gstin: supplier.gstin, phone: supplier.phone },
    });
    return supplier;
  });
  return json(created, { status: 201 });
});
