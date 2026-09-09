import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getComparativeMatrix } from "@nirman/services";
import { PERM, hasPermission } from "@/lib/roles";
import {
  apiHandler,
  getCompany,
  getCompanyGroupIds,
  getCurrentUserMembership,
  getUserRole,
  json,
  requirePermission,
  scopeWhere,
} from "@/lib/server";

/**
 * GET /api/quotations/[id] — the full comparative matrix for a quotation
 * request, plus overlay flags (canApprove / canAddQuote) and suppliers
 * so the same-page analysis sheet can render without extra hops.
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requirePermission(PERM.QUOTATION_VIEW);
  const company = await getCompany();
  const groupCompanyIds = await getCompanyGroupIds(company);
  const role = await getUserRole();
  const membership = await getCurrentUserMembership();

  const request = await prisma.quotationRequest.findFirst({
    where: { id, companyId: { in: groupCompanyIds }, ...await scopeWhere("Quotation", {}) },
    select: {
      id: true,
      status: true,
      submittedByUserCompanyId: true,
    },
  });
  if (!request) return json({ error: "Quotation request not found" }, { status: 404 });

  const matrix = await getComparativeMatrix(id);

  let canApprove = false;
  const closed = request.status === "APPROVED" || request.status === "CLOSED" || request.status === "CANCELLED";
  if (membership && !closed) {
    const submitterMembership = await prisma.userCompany.findUnique({
      where: { id: request.submittedByUserCompanyId },
      select: { reportsToUserCompanyId: true, userId: true },
    });
    if (submitterMembership?.reportsToUserCompanyId === null) {
      canApprove = user.id === submitterMembership.userId;
    } else if (submitterMembership?.reportsToUserCompanyId === membership.id) {
      canApprove = true;
    }
  }

  const canAddQuote = hasPermission(role, PERM.QUOTATION_MANAGE) && !closed;

  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true, phone: true, gstin: true },
    orderBy: { name: "asc" },
  });

  return json({ ...matrix, canApprove, canAddQuote, suppliers });
});
