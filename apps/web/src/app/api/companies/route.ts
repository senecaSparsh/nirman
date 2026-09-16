import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { seedDefaultCategories } from "@nirman/services";
import { apiHandler, getManageableCompanyIds, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const companyCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Short code used in document numbers (e.g. "SRG" → PO-SRG-260914-0001).
  code: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9]+$/, "Code must be letters/digits only").optional().nullable(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().default("INR"),
  businessType: z.string().optional().nullable(),
  parentCompanyId: z.string().optional().nullable(),
});

/**
 * GET /api/companies — list companies the current user can manage:
 * their active memberships plus every descendant of those companies.
 * OWNER/ADMIN are per-tenant roles, not platform admins — listing every
 * company would leak other tenants' names, GSTIN/PAN, and member counts
 * (and hand out the IDs needed to target them).
 * Includes the parent (for hierarchy display) and membership counts.
 */
export const GET = apiHandler(async () => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production" && user.id === "dev";
  const manageableIds = isDevBypass ? null : await getManageableCompanyIds(user.id);

  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
      ...(manageableIds ? { id: { in: manageableIds } } : {}),
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
      code: c.code,
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

  // Validate parent exists if provided — AND that it sits inside the
  // caller's own manageable tree (active membership or its descendant).
  // Without this, any owner could graft a child under another tenant and
  // then read that tenant's data through group-scoped queries.
  if (data.parentCompanyId) {
    const parent = await prisma.company.findFirst({
      where: { id: data.parentCompanyId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) {
      return json({ error: "Parent company not found" }, { status: 400 });
    }
    const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production" && user.id === "dev";
    if (!isDevBypass) {
      const manageable = await getManageableCompanyIds(user.id);
      if (!manageable.includes(parent.id)) {
        return json({ error: "You can only create a child under a company you belong to" }, { status: 403 });
      }
    }
  }

  let created;
  try {
    created = await prisma.company.create({
      data: {
        name: data.name,
        code: data.code ? data.code.toUpperCase() : null,
        gstin: data.gstin ?? null,
        pan: data.pan ?? null,
        address: data.address ?? null,
        currency: data.currency,
        businessType: data.businessType ?? null,
        parentCompanyId: data.parentCompanyId ?? null,
        // The creator becomes an OWNER of the new company.
        // Skip only in dev-bypass mode where the user is the synthetic "dev" fallback.
        userMemberships:
          process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production" && user.id === "dev" ? undefined : { create: { userId: user.id, role: "OWNER" } },
      },
      select: { id: true, name: true },
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return json({ error: "That code is already used by another company" }, { status: 409 });
    }
    throw err;
  }

  // Seed default construction categories for the new company.
  // Non-throwing — if this fails, the company is still usable; the user
  // can create categories manually. Logged for debugging.
  try {
    await seedDefaultCategories(created.id);
  } catch (err) {
    console.error("[company-create] failed to seed default categories (non-fatal):", err);
  }

  return json(created, { status: 201 });
});
