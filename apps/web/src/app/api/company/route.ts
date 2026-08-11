import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/company — returns the active company info plus the list of
 * companies the current user can switch to. In single-company setups
 * the switcher list has one entry and is hidden in the UI.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const isSuperuser = user.role === "OWNER" || user.role === "ADMIN";
  const isDevBypass = process.env.AUTH_BYPASS === "true" && user.id === "dev";

  const visible = await prisma.company.findMany({
    where: {
      deletedAt: null,
      ...(isSuperuser || isDevBypass
        ? {}
        : { userMemberships: { some: { userId: user.id } } }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      businessType: true,
      parentCompanyId: true,
      parent: { select: { id: true, name: true } },
    },
  });

  return json({
    id: company.id,
    name: company.name,
    currency: company.currency,
    gstin: company.gstin,
    pan: company.pan,
    address: company.address,
    businessType: company.businessType,
    parentCompanyId: company.parentCompanyId,
    companies: visible.map((c) => ({
      id: c.id,
      name: c.name,
      businessType: c.businessType,
      parentName: c.parent?.name ?? null,
      isCurrent: c.id === company.id,
    })),
  });
});
