import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, landSellerSchema, requirePermission } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const sellers = await prisma.landSeller.findMany({
    take: 200,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { landPurchases: { where: { deletedAt: null } } } },
    },
  });

  return json(
    sellers.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      gstin: s.gstin,
      address: s.address,
      notes: s.notes,
      purchaseCount: s._count.landPurchases,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = landSellerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // De-duplicate: if a seller with the same name+phone exists (including soft-deleted), restore it
  const existing = await prisma.landSeller.findFirst({
    where: {
      companyId: company.id,
      name: { equals: parsed.data.name, mode: "insensitive" },
      phone: parsed.data.phone ?? null,
    },
  });
  if (existing && existing.deletedAt) {
    const restored = await prisma.landSeller.update({
      where: { id: existing.id },
      data: { ...parsed.data, deletedAt: null },
    });
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A seller with this name and phone already exists", id: existing.id }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const seller = await tx.landSeller.create({
      data: { ...parsed.data, companyId: company.id },
    });
    await logAction(tx, {
      userId: user.id,
      action: "CREATE",
      entityType: "LandSeller",
      entityId: seller.id,
      after: { name: seller.name, phone: seller.phone },
    });
    return seller;
  });
  return json(created, { status: 201 });
});
