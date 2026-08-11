import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { cancelSale, completeSale, recordDeposit, recordPayment, sendNotification } from "@nirman/services";
import { apiHandler, json, toNum, paymentSchema, depositSchema, completeSaleSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";

/**
 * GET /api/sales/[id] — sale detail with payments, land parcel, built unit.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_VIEW);
  const { id } = await params;
  const s = await prisma.assetSale.findFirst({
    where: { id, companyId: user.companyId ?? undefined },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      payments: { orderBy: { paymentDate: "asc" } },
    },
  });
  if (!s) return json({ error: "Sale not found" }, { status: 404 });

  const [parcel, unit] = await Promise.all([
    s.landParcelId
      ? prisma.landParcel.findFirst({ where: { id: s.landParcelId, deletedAt: null }, select: { id: true, number: true, area: true, areaUnit: true } })
      : null,
    s.builtUnitId
      ? prisma.builtUnit.findFirst({ where: { id: s.builtUnitId, deletedAt: null }, select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true } })
      : null,
  ]);

  const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
  return json({
    id: s.id,
    saleNumber: s.saleNumber,
    assetType: s.assetType,
    landParcelId: s.landParcelId,
    landParcelNumber: parcel?.number ?? null,
    builtUnitId: s.builtUnitId,
    builtUnitNumber: unit?.unitNumber ?? null,
    builtUnitType: unit?.unitType ?? null,
    assetArea: parcel ? toNum(parcel.area) : unit ? toNum(unit.area) : null,
    assetAreaUnit: parcel?.areaUnit ?? unit?.areaUnit ?? null,
    customerId: s.customerId,
    customerName: s.customer.name,
    customerPhone: s.customer.phone,
    projectId: s.projectId,
    projectName: s.project.name,
    salePrice: toNum(s.salePrice),
    gstRate: toNum(s.gstRate),
    gstAmount: toNum(s.gstAmount),
    costBasis: toNum(s.costBasis),
    profit: toNum(s.profit),
    saleDate: s.saleDate.toISOString(),
    status: s.status,
    saleStage: s.saleStage,
    depositAmount: s.depositAmount ? toNum(s.depositAmount) : null,
    depositDate: s.depositDate ? s.depositDate.toISOString() : null,
    finalSaleDate: s.finalSaleDate ? s.finalSaleDate.toISOString() : null,
    paymentStatus: s.paymentStatus,
    paymentMode: s.paymentMode,
    notes: s.notes,
    totalPaid,
    balanceDue: toNum(s.salePrice) + toNum(s.gstAmount) - totalPaid,
    paymentCount: s.payments.length,
    payments: s.payments.map((p) => ({
      id: p.id,
      amount: toNum(p.amount),
      paymentDate: p.paymentDate.toISOString(),
      mode: p.mode,
      reference: p.reference,
      status: p.status,
    })),
  });
});

/**
 * PATCH /api/sales/[id] — cancel a sale.
 *   body: { action: "cancel" }
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  if (action === "cancel") {
    try {
      await cancelSale(id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Cancel failed") }, { status: 400 });
    }
  }

  return json({ error: "Invalid action. Use cancel." }, { status: 400 });
});

/**
 * POST /api/sales/[id] — action dispatcher for sale lifecycle.
 *   body: { action: "deposit" | "complete" | "payment", ...payload }
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  // ── Resend WhatsApp payment confirmation ──
  if (action === "resendConfirmation") {
    const paymentId = body.paymentId as string;
    if (!paymentId) return json({ error: "paymentId is required" }, { status: 400 });
    try {
      const payment = await prisma.assetSalePayment.findUnique({
        where: { id: paymentId },
        include: { assetSale: { include: { customer: { select: { name: true, phone: true } } } } },
      });
      if (!payment) return json({ error: "Payment not found" }, { status: 404 });
      if (!payment.assetSale.customer?.phone) {
        return json({ error: "Customer has no phone number on file" }, { status: 400 });
      }
      const message =
        `✅ *Payment Confirmation*\n\n` +
        `Dear ${payment.assetSale.customer.name},\n\n` +
        `We have received your payment of *${formatCurrency(Number(payment.amount))}* on ${payment.paymentDate.toISOString().slice(0, 10)}.\n` +
        (payment.reference ? `Reference: ${payment.reference}\n` : "") +
        `\nThank you for your business!`;
      await sendNotification({
        companyId: payment.assetSale.companyId,
        eventType: "PAYMENT_RECEIVED",
        channel: "WHATSAPP",
        recipient: payment.assetSale.customer.phone,
        recipientName: payment.assetSale.customer.name,
        message,
        metadata: { saleId: payment.assetSaleId, paymentId, amount: Number(payment.amount) },
      });
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed to send confirmation") }, { status: 400 });
    }
  }

  // ── Record a deposit (liability, no revenue recognition) ──
  if (action === "deposit") {
    const parsed = depositSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      const result = await recordDeposit({
        saleId: id,
        depositAmount: parsed.data.depositAmount,
        paymentMode: parsed.data.paymentMode,
        reference: parsed.data.reference ?? undefined,
        userId: user.id,
      });
      // Send WhatsApp payment confirmation to the customer
      await sendPaymentConfirmation(user.companyId ?? "", id, "deposit", parsed.data.depositAmount, parsed.data.reference ?? undefined);
      return json({ ok: true, saleStage: result.saleStage, paymentStatus: result.paymentStatus }, { status: 201 });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Deposit failed") }, { status: 400 });
    }
  }

  // ── Complete the sale (final payment + title transfer + revenue recognition) ──
  if (action === "complete") {
    const parsed = completeSaleSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      const result = await completeSale({
        saleId: id,
        finalPaymentAmount: parsed.data.finalPaymentAmount,
        paymentMode: parsed.data.paymentMode,
        reference: parsed.data.reference ?? undefined,
        userId: user.id,
      });
      // Send WhatsApp payment confirmation to the customer
      await sendPaymentConfirmation(user.companyId ?? "", id, "final", parsed.data.finalPaymentAmount ?? 0, parsed.data.reference ?? undefined);
      return json({ ok: true, saleStage: result.saleStage, paymentStatus: result.paymentStatus }, { status: 201 });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Complete failed") }, { status: 400 });
    }
  }

  // ── Record a payment (against receivable, for completed sales) ──
  if (action === "payment" || !action) {
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      const result = await recordPayment({
        assetSaleId: id,
        amount: parsed.data.amount,
        mode: parsed.data.mode,
        reference: parsed.data.reference ?? undefined,
        userId: user.id,
      });
      // Send WhatsApp payment confirmation to the customer
      await sendPaymentConfirmation(user.companyId ?? "", id, "payment", parsed.data.amount, parsed.data.reference ?? undefined);
      return json({ ok: true, paymentStatus: result.paymentStatus }, { status: 201 });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Payment failed") }, { status: 400 });
    }
  }

  return json({ error: "Invalid action. Use deposit, complete, payment, or cancel." }, { status: 400 });
});

/**
 * Send a WhatsApp payment confirmation to the customer.
 * Best-effort: failures are logged but don't block the payment.
 */
async function sendPaymentConfirmation(
  companyId: string,
  saleId: string,
  type: "deposit" | "final" | "payment",
  amount: number,
  reference?: string,
) {
  try {
    const sale = await prisma.assetSale.findUnique({
      where: { id: saleId },
      include: {
        customer: { select: { name: true, phone: true } },
        builtUnit: { select: { unitNumber: true } },
      },
    });
    if (!sale?.customer?.phone) return;

    const unitLabel = sale.builtUnit?.unitNumber ?? `Sale ${sale.saleNumber}`;
    const typeLabel = type === "deposit" ? "Token Deposit" : type === "final" ? "Final Payment" : "Payment";
    const message =
      `✅ *${typeLabel} Received*\n\n` +
      `Dear ${sale.customer.name},\n\n` +
      `We have received your ${typeLabel.toLowerCase()} of *${formatCurrency(amount)}* for ${unitLabel}.\n` +
      (reference ? `Reference: ${reference}\n` : "") +
      `\nThank you for your business!\n` +
      `— ${sale.companyId ? "Nirman Inventory" : "Our Team"}`;

    await sendNotification({
      companyId,
      eventType: "PAYMENT_RECEIVED",
      channel: "WHATSAPP",
      recipient: sale.customer.phone,
      recipientName: sale.customer.name,
      message,
      metadata: { saleId, type, amount, reference },
    });
  } catch {
    // Notification failure should not block the payment
  }
}
