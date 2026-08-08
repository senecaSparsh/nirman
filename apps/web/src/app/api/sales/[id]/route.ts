import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { cancelSale, completeSale, recordDeposit, recordPayment } from "@nirman/services";
import { apiHandler, json, toNum, paymentSchema, depositSchema, completeSaleSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

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
    balanceDue: toNum(s.salePrice) - totalPaid,
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
      return json({ ok: true, paymentStatus: result.paymentStatus }, { status: 201 });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Payment failed") }, { status: 400 });
    }
  }

  return json({ error: "Invalid action. Use deposit, complete, payment, or cancel." }, { status: 400 });
});
