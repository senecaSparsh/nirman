import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import { z } from "zod";

/**
 * POST /api/payroll/[id]/lines/[lineId]/mark-paid
 * Marks a single payroll line as paid, records payment reference + proof.
 *
 * Body: {
 *   paymentReference?: string,  // UTR / cheque no / NEFT reference
 *   paymentMode?: string,      // BANK | CASH | UPI | CHEQUE | NEFT
 *   paymentDate?: string,      // ISO date when paid
 *   proofUploadId?: string,    // uploaded proof document
 * }
 *
 * Requires PAYROLL_MANAGE permission.
 * The parent PayrollPeriod is auto-marked PAID when all its lines have paymentDate set.
 */
const markPaidSchema = z.object({
  paymentReference: z.string().max(100).optional().nullable(),
  paymentMode: z.enum(["BANK", "CASH", "UPI", "CHEQUE", "NEFT"]).optional().nullable(),
  paymentDate: z.string().datetime().optional().nullable(),
  proofUploadId: z.string().max(100).optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) => {
  const session = await requirePermission(PERM.PAYROLL_MANAGE);
  const company = await getCompany();
  const { id: periodId, lineId } = await params;
  const body = await req.json();
  const parsed = markPaidSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Load the line + verify it belongs to this company via the period + scope
  const line = await prisma.payrollLine.findFirst({
    where: { id: lineId, payrollPeriodId: periodId, ...await scopeWhere("PayrollLine") },
    include: {
      payrollPeriod: { select: { id: true, companyId: true, status: true, month: true, year: true } },
      employee: { select: { id: true, name: true } },
    },
  });

  if (!line) {
    return json({ error: "Payroll line not found" }, { status: 404 });
  }
  if (line.payrollPeriod.companyId !== company.id) {
    return json({ error: "Not authorized" }, { status: 403 });
  }
  if (line.payrollPeriod.status === "DRAFT") {
    return json({ error: "Process the payroll period before marking lines as paid" }, { status: 400 });
  }

  // Validate proofUploadId belongs to this company if provided
  if (parsed.data.proofUploadId) {
    const upload = await prisma.upload.findUnique({
      where: { id: parsed.data.proofUploadId },
      select: { companyId: true },
    }).catch(() => null);
    if (!upload || upload.companyId !== company.id) {
      return json({ error: "Invalid proof upload" }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = { paidById: session.id };
  if (parsed.data.paymentReference !== undefined) update.paymentReference = parsed.data.paymentReference ?? null;
  if (parsed.data.paymentMode !== undefined) update.paymentMode = parsed.data.paymentMode ?? null;
  if (parsed.data.paymentDate !== undefined) update.paymentDate = parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : null;
  if (parsed.data.proofUploadId !== undefined) update.proofUploadId = parsed.data.proofUploadId ?? null;

  const updated = await prisma.payrollLine.update({
    where: { id: lineId },
    data: update,
  });

  // Auto-mark the period as PAID when ALL lines have a paymentDate
  const allLines = await prisma.payrollLine.findMany({
    where: { payrollPeriodId: periodId, ...await scopeWhere("PayrollLine") },
    select: { paymentDate: true },
  });
  const allPaid = allLines.length > 0 && allLines.every((l) => l.paymentDate !== null);
  if (allPaid && line.payrollPeriod.status !== "PAID") {
    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: "PAID", paidAt: new Date() },
    });
  }

  await logAction(prisma, {
    userId: session.id,
    companyId: company.id,
    action: "PAYROLL_LINE_PAID",
    entityType: "PayrollLine",
    entityId: lineId,
    after: {
      employee: line.employee.name,
      month: line.payrollPeriod.month,
      year: line.payrollPeriod.year,
      netPay: updated.netPay.toString(),
      paymentReference: parsed.data.paymentReference ?? null,
      paymentMode: parsed.data.paymentMode ?? null,
    },
  });

  // Revalidate employee + payroll pages
  if (line.employee) {
    revalidatePath(`/m/hr/employees/${line.employee.id}`);
    revalidatePath(`/hr/employees/${line.employee.id}`);
  }
  revalidatePath("/m/hr/employees");
  revalidatePath("/hr/employees");
  revalidatePath("/m/books/payroll");
  revalidatePath("/books/payroll");
  revalidatePath(`/api/payroll/${periodId}`);

  return json({
    ok: true,
    message: `Marked ${line.employee.name}'s salary as paid`,
    line: {
      id: updated.id,
      paymentReference: updated.paymentReference,
      paymentMode: updated.paymentMode,
      paymentDate: updated.paymentDate?.toISOString() ?? null,
      proofUploadId: updated.proofUploadId,
    },
    periodStatus: allPaid ? "PAID" : line.payrollPeriod.status,
  });
});
