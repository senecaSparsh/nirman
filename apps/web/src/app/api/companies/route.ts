import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const companyCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().default("INR"),
  businessType: z.string().optional().nullable(),
  parentCompanyId: z.string().optional().nullable(),
});

/**
 * GET /api/companies — list companies the current user can see.
 * - OWNER/ADMIN: every non-deleted company.
 * - Others: only companies they have a UserCompany membership in.
 * Includes the parent (for hierarchy display) and membership counts.
 */
export const GET = apiHandler(async () => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const isSuperuser = user.role === "OWNER" || user.role === "ADMIN";

  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
      ...(isSuperuser
        ? {}
        : { userMemberships: { some: { userId: user.id } } }),
    },
    orderBy: { name: "asc" },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { userMemberships: true, children: true } },
    },
  });

  return json(
    companies.map((c) => ({
      id: c.id,
      name: c.name,
      gstin: c.gstin,
      pan: c.pan,
      address: c.address,
      currency: c.currency,
      businessType: c.businessType,
      parentCompanyId: c.parentCompanyId,
      parentName: c.parent?.name ?? null,
      memberCount: c._count.userMemberships,
      hasChildren: c._count.children > 0,
    })),
  );
});

/**
 * POST /api/companies — create a new company. OWNER/ADMIN only.
 * The creating user is added as an OWNER of the new company so they
 * can operate within it immediately.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const body = await req.json();
  const parsed = companyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  // Validate parent exists if provided
  if (data.parentCompanyId) {
    const parent = await prisma.company.findFirst({
      where: { id: data.parentCompanyId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) {
      return json({ error: "Parent company not found" }, { status: 400 });
    }
  }

  const created = await prisma.company.create({
    data: {
      name: data.name,
      gstin: data.gstin ?? null,
      pan: data.pan ?? null,
      address: data.address ?? null,
      currency: data.currency,
      businessType: data.businessType ?? null,
      parentCompanyId: data.parentCompanyId ?? null,
      // The creator becomes an OWNER of the new company.
      userMemberships:
        user.id === "dev" ? undefined : { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true, name: true },
  });

  return json(created, { status: 201 });
});
