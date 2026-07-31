import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, supplierSchema, toNum } from "@/lib/server";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          purchaseOrders: { where: { status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } },
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
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.supplier.create({ data: parsed.data });
  return json(created, { status: 201 });
});
