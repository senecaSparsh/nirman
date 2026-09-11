import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import {
  submitExpenseClaim,
  approveExpenseClaim,
  rejectExpenseClaim,
  payExpenseClaim,
  ServiceError,
} from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pay"]).optional(),
  rejectionReason: z.string().optional(),
  reason: z.string().optional(),
  paymentMode: z.string().optional(),
  referenceNo: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const c = await prisma.expenseClaim.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("ExpenseClaim", {}) },
    include: {
      claimant: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      lines: { include: { categoryMaster: { select: { id: true, name: true } } } },
    },
  });
  if (!c) return json({ error: "Claim not found" }, { status: 404 });
  return json({
    id: c.id,
    claimantId: c.claimantId,
    claimantName: c.claimant.name,
    projectId: c.projectId,
    projectName: c.project?.name ?? null,
    status: c.status,
    totalAmount: toNum(c.totalAmount),
    description: c.description,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    approvedById: c.approvedById,
    approvedByName: c.approvedBy?.name ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    rejectedReason: c.rejectedReason,
    paidAt: c.paidAt?.toISOString() ?? null,
    paymentMode: c.paymentMode,
    referenceNo: c.referenceNo,
    lines: c.lines.map((l) => ({
      id: l.id,
      categoryId: l.categoryId,
      categoryName: l.categoryMaster?.name ?? null,
      category: l.category,
      amount: toNum(l.amount),
      gstRate: l.gstRate ? toNum(l.gstRate) : null,
      gstAmount: l.gstAmount ? toNum(l.gstAmount) : null,
      date: l.date.toISOString(),
      receiptUrl: l.receiptUrl,
      notes: l.notes,
    })),
    createdAt: c.createdAt.toISOString(),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const company = await getCompany();

  // Scoped pre-fetch
  const existing = await prisma.expenseClaim.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("ExpenseClaim") },
  });
  if (!existing) return json({ error: "Expense claim not found or out of scope" }, { status: 404 });

  try {
    if (d.action === "submit") {
      const user = await requirePermission(PERM.EXPENSE_CREATE);
      await submitExpenseClaim(id, company.id, user.id);
    } else if (d.action === "approve") {
      const user = await requirePermission(PERM.EXPENSE_APPROVE);
      await approveExpenseClaim(id, company.id, user.id);
    } else if (d.action === "reject") {
      const user = await requirePermission(PERM.EXPENSE_APPROVE);
      if (!d.rejectionReason?.trim() && !d.reason?.trim()) return json({ error: "A rejection reason is required" }, { status: 400 });
      await rejectExpenseClaim(id, company.id, (d.rejectionReason ?? d.reason ?? "").trim(), user.id);
    } else if (d.action === "pay") {
      const user = await requirePermission(PERM.FINANCE_MANAGE);
      if (!d.paymentMode) return json({ error: "Payment mode is required" }, { status: 400 });
      await payExpenseClaim(id, company.id, { paymentMode: d.paymentMode, referenceNo: d.referenceNo ?? null }, user.id);
    } else {
      return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/expense-claims");
  revalidatePath("/approvals");
  revalidatePath("/expenses");
  revalidatePath("/finance");
  revalidatePath("/gl");
  revalidatePath("/m/expense-claims");
  revalidatePath("/m/accounts?tab=expenses");
  revalidatePath("/m/approvals");
  return json({ ok: true });
});
