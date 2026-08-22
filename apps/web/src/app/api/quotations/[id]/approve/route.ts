import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { approveQuotation } from "@nirman/services";
import { PERM } from "@/lib/roles";
import {
  apiHandler,
  getCompany,
  getCurrentUserMembership,
  json,
  requirePermission,
  approveQuotationSchema,
} from "@/lib/server";

/**
 * POST /api/quotations/[id]/approve — approve a quotation request and
 * select the winning quote.
 *
 * ENFORCEMENT: only the submitter's DIRECT REPORTING MANAGER (one level
 * up via UserCompany.reportsToUserCompanyId) can approve. The service
 * layer enforces this — the API just passes the approver's membership ID.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.QUOTATION_VIEW);
  const company = await getCompany();
  const { id } = { id: new URL(req.url).pathname.split("/").slice(-2, -1)[0]! };

  // Verify the request belongs to the current company.
  const request = await prisma.quotationRequest.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, status: true },
  });
  if (!request) return json({ error: "Quotation request not found" }, { status: 404 });
  if (request.status === "APPROVED") {
    return json({ error: "This request is already approved" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = approveQuotationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const membership = await getCurrentUserMembership();
  if (!membership) {
    return json({ error: "No company membership found — cannot verify reporting hierarchy" }, { status: 403 });
  }

  try {
    const updated = await approveQuotation({
      quotationRequestId: id,
      approverUserCompanyId: membership.id,
      approverUserId: user.id,
      selectedQuoteId: parsed.data.selectedQuoteId,
      reason: parsed.data.reason ?? undefined,
    });
    return json({
      id: updated.id,
      status: updated.status,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
      selectedQuoteId: updated.selectedQuoteId,
      purchaseOrder: updated.purchaseOrder
        ? {
            id: updated.purchaseOrder.id,
            poNumber: updated.purchaseOrder.poNumber,
            total: updated.purchaseOrder.total.toNumber(),
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to approve";
    const status = message.includes("not found") ? 404 : message.includes("only") || message.includes("manager") ? 403 : 400;
    return json({ error: message }, { status });
  }
});
