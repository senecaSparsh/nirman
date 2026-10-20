import { type NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { sendDemandNotice } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/payment-schedules/items/[id]/demand
 *
 * Send a formal payment demand notice for an overdue installment —
 * the construction-linked-plan demand letter. Computes RERA late
 * interest (SBI MCLR + 2%) and dispatches via WhatsApp/Email; the
 * NotificationLog row is the dispatch evidence.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.paymentScheduleItem.findFirst({
    where: { id, paymentSchedule: { assetSale: { companyId: company.id } } },
    select: { id: true },
  });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  try {
    const result = await sendDemandNotice(id, company.id, user.id);
    return json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send demand";
    const status = message.includes("not found") ? 404 : message.includes("not yet overdue") || message.includes("Cannot demand") ? 409 : 400;
    return json({ error: message }, { status });
  }
});
