import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { submitRaBill, approveRaBill, rejectRaBill, payRaBill } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const bill = await prisma.raBill.findFirst({
    where: { id, companyId: company.id },
    include: {
      workOrder: {
        select: {
          id: true, workOrderNumber: true, workTitle: true,
          subcontractor: { select: { id: true, name: true, trade: true, gstin: true } },
          retentionPct: true, tdsPct: true, tdsCategory: true, advanceAmount: true, advanceRecoveryPct: true,
        },
      },
      project: { select: { id: true, name: true } },
      lines: {
        include: {
          boqItem: { select: { id: true, serialNo: true, description: true, unit: true } },
          mbEntries: { select: { id: true, mbNumber: true, measuredQty: true, measureDate: true } },
        },
      },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!bill) return json({ error: "RA bill not found" }, { status: 404 });
  return json({
    ...bill,
    grossAmount: toNum(bill.grossAmount),
    cumulativeGross: toNum(bill.cumulativeGross),
    retentionAmount: toNum(bill.retentionAmount),
    tdsAmount: toNum(bill.tdsAmount),
    advanceRecovery: toNum(bill.advanceRecovery),
    otherDeductions: toNum(bill.otherDeductions),
    netPayable: toNum(bill.netPayable),
    lines: bill.lines.map((l) => ({
      ...l,
      prevQty: toNum(l.prevQty),
      thisQty: toNum(l.thisQty),
      totalQty: toNum(l.totalQty),
      rate: toNum(l.rate),
      prevAmount: toNum(l.prevAmount),
      thisAmount: toNum(l.thisAmount),
      totalAmount: toNum(l.totalAmount),
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  // Enforce granular permissions per action (segregation of duties)
  const requiredPerm =
    action === "submit" ? PERM.RA_SUBMIT :
    action === "approve" || action === "reject" ? PERM.RA_APPROVE :
    action === "pay" ? PERM.RA_PAY :
    PERM.ASSETS_MANAGE; // fallback
  const user = await requirePermission(requiredPerm);

  try {
    if (action === "submit") {
      const bill = await submitRaBill(id, user.id);
      return json(bill);
    }
    if (action === "approve") {
      const bill = await approveRaBill(id, user.id);
      return json(bill);
    }
    if (action === "reject") {
      const schema = { reason: body.reason };
      if (!schema.reason) return json({ error: "Rejection reason is required" }, { status: 400 });
      const bill = await rejectRaBill(id, body.reason, user.id);
      return json(bill);
    }
    if (action === "pay") {
      const bill = await payRaBill(id, user.id, body?.paymentMode, body?.paymentReference);
      return json(bill);
    }
    return json({ error: "Unknown action. Use: submit | approve | reject | pay" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
