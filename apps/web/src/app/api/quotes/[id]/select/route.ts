import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { selectWinningQuote, notifyQuoteApproval } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { z } from "zod";

const selectSchema = z.object({
  selectionReason: z.string().optional().nullable(),
});

/**
 * POST /api/quotes/[id]/select
 * Select this quote as the winning quote for its requisition.
 * Requires po.approve (the approver makes the final call — they may override
 * the cheapest recommendation with a reason).
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
        { quotationRequest: { companyId: company.id } },
      ],
    },
    include: {
      supplier: { select: { name: true } },
      requisition: {
        select: {
          reqNumber: true,
          requestedById: true,
          requestedBy: { select: { name: true, phone: true } },
        },
      },
    },
  });
  if (!existing) return json({ error: "Quote not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await selectWinningQuote({
    quoteId: id,
    selectedById: user.id,
    selectionReason: parsed.data.selectionReason ?? undefined,
  });

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

  return json({ ok: true, id: updated.id, status: updated.status });
});
