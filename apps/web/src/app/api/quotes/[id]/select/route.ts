import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { selectWinningQuote, notifyQuoteApproval, convertRequisitionToPo, getCachedRoutingScope } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, assertScopeAllows, getCompany, json, requirePermission } from "@/lib/server";
import { z } from "zod";

const selectSchema = z.object({
  selectionReason: z.string().optional().nullable(),
});

/**
 * POST /api/quotes/[id]/select
 * Select this quote as the winning quote for its requisition.
 * Requires po.approve (the approver makes the final call — they may override
 * the cheapest recommendation with a reason).
 *
 * When the quote belongs to a requisition (not a quotation request), the
 * selection ALSO auto-converts the requisition to a PO — no separate
 * "Convert to PO" button needed. The PO is created as APPROVED + ORDERED,
 * skipping two manual steps (PO approval + mark as ordered). This mirrors
 * the quotation request flow where quote selection IS the approval to buy.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PO_APPROVE);
  const company = await getCompany();
  const { id } = await params;

  // Verify the quote belongs to the current company
  const existing = await prisma.vendorQuote.findFirst({
    where: {
      id,
      OR: [
        { requisition: { project: { companyId: company.id } } },
        { requisition: { department: { companyId: company.id } } },
        { quotationRequest: { companyId: company.id } },
      ],
    },
    include: {
      supplier: { select: { name: true, id: true } },
      lines: { select: { materialId: true, unitPrice: true } },
      requisition: {
        select: {
          reqNumber: true,
          requestedById: true,
          status: true,
          projectId: true,
          departmentId: true,
          lciDecision: true,
          requestedBy: { select: { name: true, phone: true } },
        },
      },
      quotationRequest: { select: { projectId: true } },
    },
  });
  if (!existing) return json({ error: "Quote not found" }, { status: 404 });
  // Scoped approvers may only award quotes anchored inside their scope —
  // selection auto-converts the requisition to a PO, so this is a mutation
  // on the out-of-scope indent too.
  try {
    await assertScopeAllows({
      projectId: existing.requisition?.projectId ?? existing.quotationRequest?.projectId ?? null,
      departmentId: existing.requisition?.departmentId ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await selectWinningQuote({
    quoteId: id,
    selectedById: user.id,
    selectionReason: parsed.data.selectionReason ?? undefined,
  });

  // ── Auto-convert requisition to PO ──
  // The quote selection IS the approval to buy. Auto-create the PO using
  // the winning quote's data (supplier, line costs, landed cost components).
  // The PO is created as APPROVED + immediately ORDERED, eliminating 3
  // manual steps: Convert button → Convert dialog → PO approval → mark ordered.
  //
  // Only auto-convert if the quote belongs to a requisition (not a quotation
  // request — those have their own auto-convert in approveQuotationRequest).
  // Best-effort: if auto-conversion fails (e.g. no destination location
  // found), the quote is still selected — the user can manually convert.
  let autoPo: { poId: string; poNumber: string } | null = null;
  if (existing.requisitionId && existing.requisition?.status === "APPROVED") {
    try {
      const req = existing.requisition;

      // Resolve procurement scope from LCI recommendation (fall back to PROJECT)
      let scope: "COMPANY" | "PROJECT" = "PROJECT";
      try {
        const cached = await getCachedRoutingScope(existing.requisitionId);
        if (cached) scope = cached;
      } catch { /* use default */ }

      // Auto-resolve destination location. When the project has no site
      // store, fall back to the company warehouse — the goods can transfer
      // onward from there. Never skip PO creation just because a project
      // lacks a site location; that strands the indent with a selected
      // quote and no PO.
      let destLocationId: string | null = null;
      if (scope === "PROJECT" && req.projectId) {
        const projectLocation = await prisma.stockLocation.findFirst({
          where: { projectId: req.projectId, type: "PROJECT_SITE", deletedAt: null },
          select: { id: true },
        });
        destLocationId = projectLocation?.id ?? null;
      }
      if (!destLocationId) {
        const companyLocation = await prisma.stockLocation.findFirst({
          where: { companyId: company.id, type: "COMPANY_WAREHOUSE", deletedAt: null },
          select: { id: true },
        });
        destLocationId = companyLocation?.id ?? null;
      }

      if (destLocationId) {
        // Build line costs from the winning quote's lines
        const lineCosts: Record<string, number> = {};
        for (const line of existing.lines) {
          lineCosts[line.materialId] = Number(line.unitPrice);
        }

        const po = await convertRequisitionToPo({
          requisitionId: existing.requisitionId,
          supplierId: existing.supplier.id,
          procurementScope: scope,
          destinationLocationId: destLocationId,
          lineCosts,
          userId: user.id,
          autoOrder: true,
          approverId: user.id,
        });
        autoPo = { poId: po.id, poNumber: po.poNumber ?? po.id };
      }
    } catch (err) {
      // Best-effort — the quote is selected even if auto-conversion fails.
      // The user can manually convert from the requisitions page.
      console.error("[quotes/select] Auto-convert requisition to PO failed:", err);
    }
  }

  // Fire WhatsApp notification to the purchaser who submitted the requisition
  try {
    const purchaser = existing.requisition?.requestedBy;
    if (purchaser?.phone && existing.requisitionId) {
      // Get the winning quote's total for the notification
      const winner = await prisma.vendorQuote.findFirst({
        where: { requisitionId: existing.requisitionId, status: "SELECTED" },
        select: { landedTotal: true },
      });
      await notifyQuoteApproval(
        company.id,
        {
          id: updated.id,
          vendorName: existing.supplier.name,
          totalAmount: winner?.landedTotal ? Number(winner.landedTotal) : 0,
          isCheapest: existing.isCheapest,
        },
        { id: existing.requisitionId, number: existing.requisition?.reqNumber ?? "" },
        [{ phone: purchaser.phone, name: purchaser.name }],
      );
    }
  } catch {
    // Notification failures should not block the quote selection
  }

  revalidatePath("/requisitions");
  revalidatePath("/procurement");
  revalidatePath("/m/procurement");
  revalidatePath("/approvals");
  // The mobile detail page computes the winning-quote convert affordance —
  // without this, it serves a stale RSC payload that hides "Convert to PO".
  if (existing.requisitionId) {
    revalidatePath(`/m/requisitions/${existing.requisitionId}`);
  }
  return json({
    ok: true,
    id: updated.id,
    status: updated.status,
    autoConvertedPo: autoPo,
  });
});
