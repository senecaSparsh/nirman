import { NextRequest } from "next/server";
import { recordSchedulePayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  amount: z.coerce.number().min(0),
  // Late-payment interest collected alongside the principal leg (≤ accrued
  // at MCLR+2% — the service clamps and posts it to 4450 Interest Income).
  interestAmount: z.coerce.number().min(0).optional(),
  paymentMode: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.paymentScheduleItem.findFirst({ where: { id, paymentSchedule: { assetSale: { companyId: company.id } } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const item = await recordSchedulePayment(id, parsed.data.amount, parsed.data.paymentMode, user.id, parsed.data.interestAmount);
    // Buyer confirmation — the installment path bypassed the sale-payment
    // route's WhatsApp receipt, so a UPI payer got silence. Notify post-commit.
    try {
      const scheduleItem = await prisma.paymentScheduleItem.findUnique({
        where: { id },
        include: {
          paymentSchedule: {
            include: { assetSale: { include: { customer: { select: { name: true, phone: true } }, builtUnit: { select: { unitNumber: true } } } } },
          },
        },
      });
      const cust = scheduleItem?.paymentSchedule.assetSale.customer;
      if (scheduleItem && cust?.phone) {
        const total = parsed.data.amount + (parsed.data.interestAmount ?? 0);
        const unit = scheduleItem.paymentSchedule.assetSale.builtUnit?.unitNumber ?? scheduleItem.paymentSchedule.assetSale.saleNumber;
        const { sendNotification } = await import("@nirman/services");
        await sendNotification({
          companyId: company.id,
          eventType: "PAYMENT_RECEIVED",
          channel: "WHATSAPP",
          recipient: cust.phone,
          recipientName: cust.name,
          message:
            `✅ *Installment Payment Received*\n\n` +
            `Dear ${cust.name},\n\n` +
            `We have received your payment of *${formatCurrency(total)}* for installment #${scheduleItem.installmentNo} on ${unit}.` +
            (parsed.data.interestAmount ? ` (includes ${formatCurrency(parsed.data.interestAmount)} late interest)` : "") +
            `\n\nThank you for your business!`,
          metadata: { scheduleItemId: id, type: "installment", amount: total },
        });
      }
    } catch { /* notification failure never fails the payment */ }
    return json(item);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
