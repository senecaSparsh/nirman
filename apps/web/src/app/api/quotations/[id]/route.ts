import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { cancelQuotationRequest, getComparativeMatrix } from "@nirman/services";
import { PERM, hasPermission } from "@/lib/roles";
import {
  apiHandler,
  getCompany,
  getCompanyGroupIds,
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

  const closed = request.status === "APPROVED" || request.status === "CLOSED" || request.status === "CANCELLED";
  const canApprove = hasPermission(role, PERM.QUOTATION_MANAGE) && !closed
    ? user.id !== (await prisma.userCompany.findUnique({
        where: { id: request.submittedByUserCompanyId },
        select: { userId: true },
      }))?.userId
    : false;

  const canAddQuote = hasPermission(role, PERM.QUOTATION_MANAGE) && !closed;

  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true, phone: true, gstin: true },
    orderBy: { name: "asc" },
  });

  return json({ ...matrix, canApprove, canAddQuote, suppliers });
});

/**
 * PATCH /api/quotations/[id] — cancel a quotation request.
 * Body: { action: "cancel", reason?: string }
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requirePermission(PERM.QUOTATION_MANAGE);
  const body = await req.json();

  if (body?.action !== "cancel") {
    return json({ error: "Unknown action. Use: cancel" }, { status: 400 });
  }

  try {
    const updated = await cancelQuotationRequest(id, user.id, body.reason);
    revalidatePath("/quotations");
    revalidatePath("/m/quotations");
    return json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to cancel";
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: msg }, { status });
  }
});
