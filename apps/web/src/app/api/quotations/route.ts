import { NextRequest } from "next/server";
import {
  createQuotationRequest,
  listQuotationRequests,
  getPendingApprovalsForManager,
  seedHsnGstRates,
} from "@nirman/services";
import { PERM } from "@/lib/roles";
import {
  apiHandler,
  getCompany,
  getCompanyGroupIds,
  getCurrentUserMembership,
  json,
  requirePermission,
  quotationRequestSchema,
} from "@/lib/server";

/**
 * GET /api/quotations
 *   ?scope=mine       — requests I submitted
 *   ?scope=pending    — requests pending my approval (direct reports)
 *   ?scope=all        — all requests in the company (default)
 *   ?status=OPEN,QUOTES_COLLECTED — filter by status (comma-separated)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.QUOTATION_VIEW);
  const company = await getCompany();
  const groupCompanyIds = await getCompanyGroupIds(company);
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const statusParam = url.searchParams.get("status");
  const statusFilter = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  if (scope === "pending") {
    const membership = await getCurrentUserMembership();
    if (!membership) return json([]);
    const pending = await getPendingApprovalsForManager(membership.id);
    return json(
      pending.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        title: r.title,
        status: r.status,
        projectName: r.project?.name ?? null,
        projectId: r.project?.id ?? null,
        submittedByName: r.submittedByName,
        createdAt: r.createdAt.toISOString(),
        lineCount: r.lines.length,
        quoteCount: r.quotes.length,
        minQuotesRequired: r.minQuotesRequired,
        quotesMet: r.quotes.length >= r.minQuotesRequired,
        selectedQuoteId: r.selectedQuoteId ?? null,
        convertedPo: null,
      })),
    );
  }

  const filters: { status?: string[]; submittedByUserCompanyId?: string } = {};
  if (statusFilter) filters.status = statusFilter;

  if (scope === "mine") {
    const membership = await getCurrentUserMembership();
    if (!membership) return json([]);
    filters.submittedByUserCompanyId = membership.id;
  }

  const requests = await listQuotationRequests(groupCompanyIds, filters);
  return json(
    requests.map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      status: r.status,
      projectName: r.project?.name ?? null,
      projectId: r.project?.id ?? null,
      submittedByName: r.submittedBy?.name ?? "—",
      createdAt: r.createdAt.toISOString(),
      lineCount: r.lines.length,
      quoteCount: r.quotes.length,
      minQuotesRequired: r.minQuotesRequired,
      quotesMet: r.quotes.length >= r.minQuotesRequired,
      selectedQuoteId: r.selectedQuoteId ?? null,
      convertedPo: r.convertedPo
        ? { id: r.convertedPo.id, poNumber: r.convertedPo.poNumber, status: r.convertedPo.status }
        : null,
    })),
  );
});

/**
 * POST /api/quotations — create a standalone quotation request.
 * The submitter's UserCompany membership is resolved automatically.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.QUOTATION_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = quotationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const membership = await getCurrentUserMembership();
  if (!membership) {
    return json({ error: "No company membership found for the current user" }, { status: 403 });
  }

  const created = await createQuotationRequest({
    companyId: company.id,
    projectId: parsed.data.projectId ?? null,
    title: parsed.data.title,
    notes: parsed.data.notes ?? undefined,
    minQuotesRequired: parsed.data.minQuotesRequired,
    requiredByDate: parsed.data.requiredByDate ? new Date(parsed.data.requiredByDate) : null,
    workActivity: parsed.data.workActivity ?? undefined,
    destinationLocationId: parsed.data.destinationLocationId,
    submittedById: user.id,
    submittedByUserCompanyId: membership.id,
    lines: parsed.data.lines.map((l) => ({
      materialId: l.materialId,
      qtyRequired: l.qtyRequired,
    })),
  });

  return json(
    {
      id: created.id,
      requestNumber: created.requestNumber,
      title: created.title,
      status: created.status,
      lineCount: created.lines.length,
    },
    { status: 201 },
  );
});

/**
 * PUT /api/quotations — seed the HSN/GST master (admin utility).
 */
export const PUT = apiHandler(async () => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const result = await seedHsnGstRates();
  return json({ seeded: result.created, message: "HSN/GST master seeded" });
});
