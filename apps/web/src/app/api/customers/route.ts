import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, customerSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  // Customer has no companyId — scope to customers that have sales in this company.
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assetSales: { where: { companyId: company.id, status: "ACTIVE" } } } },
    },
  });
  return json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      gstin: c.gstin,
      address: c.address,
      activeSales: c._count.assetSales,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const body = await req.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({ data: parsed.data });
    await logAction(tx, {
      userId: user.id,
      action: "CUSTOMER_CREATE",
      entityType: "Customer",
      entityId: customer.id,
      after: { name: customer.name, phone: customer.phone, gstin: customer.gstin },
    });
    return customer;
  });
  return json(created, { status: 201 });
});
