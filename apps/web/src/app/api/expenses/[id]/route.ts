import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import {
  updateExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  deleteExpense,
  ServiceError,
} from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const expenseUpdateSchema = z.object({
  projectId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required").optional(),
  amount: z.coerce.number().positive("Amount must be > 0").optional(),
  subtotal: z.coerce.number().nonnegative().optional(),
  cgst: z.coerce.number().nonnegative().optional(),
  sgst: z.coerce.number().nonnegative().optional(),
  igst: z.coerce.number().nonnegative().optional(),
  tdsAmount: z.coerce.number().nonnegative().optional(),
  supplierId: z.string().optional().nullable(),
  payeeName: z.string().optional().nullable(),
  paymentMode: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  chequeNo: z.string().optional().nullable(),
  chequeDate: z.string().optional().nullable(),
  chequePhotoUrl: z.string().optional().nullable(),
  referenceNo: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Workflow actions (mutually exclusive with field updates)
  action: z.enum(["submit", "approve", "reject"]).optional(),
  rejectionReason: z.string().optional(),
  allowBudgetOverrun: z.boolean().optional(),
});

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const e = await prisma.expense.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("Expense", {}) },
    include: {
      project: { select: { id: true, name: true } },
      categoryMaster: { select: { id: true, name: true, glAccountCode: true } },
      supplier: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!e) return json({ error: "Expense not found" }, { status: 404 });
  return json({
    id: e.id,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    categoryId: e.categoryId,
    categoryName: e.categoryMaster?.name ?? null,
    category: e.category,
    amount: toNum(e.amount),
    subtotal: toNum(e.subtotal),
    cgst: toNum(e.cgst),
    sgst: toNum(e.sgst),
    igst: toNum(e.igst),
    tdsAmount: toNum(e.tdsAmount),
    supplierId: e.supplierId,
    supplierName: e.supplier?.name ?? null,
    payeeName: e.payeeName,
    paymentMode: e.paymentMode,
    bankAccount: e.bankAccount,
    chequeNo: e.chequeNo,
    chequeDate: e.chequeDate?.toISOString() ?? null,
    chequePhotoUrl: e.chequePhotoUrl,
    referenceNo: e.referenceNo,
    receiptUrl: e.receiptUrl,
    status: e.status,
    submittedById: e.submittedById,
    submittedByName: e.submittedBy?.name ?? null,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    approvedById: e.approvedById,
    approvedByName: e.approvedBy?.name ?? null,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    rejectedReason: e.rejectedReason,
    glPostedAt: e.glPostedAt?.toISOString() ?? null,
    createdByName: e.createdBy?.name ?? null,
    date: e.date.toISOString(),
    notes: e.notes,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const parsed = expenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  // ── Workflow actions ──
  if (d.action === "submit") {
    const user = await requirePermission(PERM.EXPENSE_CREATE);
    const company = await getCompany();
    try {
      await submitExpense(id, company.id, user.id);
    } catch (err) {
      if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
      throw err;
    }
    revalidatePath("/expenses");
    revalidatePath("/m/expenses");
    revalidatePath("/m/accounts?tab=expenses");
    revalidatePath("/approvals");
    return json({ ok: true, status: "PENDING" });
  }
  if (d.action === "approve") {
    const user = await requirePermission(PERM.EXPENSE_APPROVE);
    const company = await getCompany();
    try {
      await approveExpense(id, company.id, user.id, { allowBudgetOverrun: d.allowBudgetOverrun === true });
    } catch (err) {
      if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
      throw err;
    }
    revalidatePath("/expenses");
    revalidatePath("/m/expenses");
    revalidatePath("/m/accounts?tab=expenses");
    revalidatePath("/approvals");
    revalidatePath("/finance");
    revalidatePath("/gl");
    return json({ ok: true, status: "APPROVED" });
  }
  if (d.action === "reject") {
    const user = await requirePermission(PERM.EXPENSE_APPROVE);
    const company = await getCompany();
    if (!d.rejectionReason?.trim()) {
      return json({ error: "A rejection reason is required" }, { status: 400 });
    }
    try {
      await rejectExpense(id, company.id, d.rejectionReason, user.id);
    } catch (err) {
      if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
      throw err;
    }
    revalidatePath("/expenses");
    revalidatePath("/m/expenses");
    revalidatePath("/m/accounts?tab=expenses");
    revalidatePath("/approvals");
    return json({ ok: true, status: "REJECTED" });
  }

  // ── Field update (DRAFT / REJECTED only) ──
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();

  try {
    await assertScopeAllows({
      projectId: d.projectId ?? null,
      departmentId: null,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Scope violation" },
      { status: 403 },
    );
  }

  let expenseDate: Date | null | undefined;
  if (d.date !== undefined) {
    if (d.date) {
      expenseDate = new Date(d.date);
      if (isNaN(expenseDate.getTime())) return json({ error: "Invalid date format" }, { status: 400 });
    } else {
      expenseDate = null;
    }
  }
  let chequeDate: Date | null | undefined;
  if (d.chequeDate !== undefined) {
    if (d.chequeDate) {
      chequeDate = new Date(d.chequeDate);
      if (isNaN(chequeDate.getTime())) return json({ error: "Invalid cheque date format" }, { status: 400 });
    } else {
      chequeDate = null;
    }
  }

  try {
    await updateExpense(id, {
      companyId: company.id,
      projectId: d.projectId,
      categoryId: d.categoryId,
      category: d.category,
      amount: d.amount,
      subtotal: d.subtotal,
      cgst: d.cgst,
      sgst: d.sgst,
      igst: d.igst,
      tdsAmount: d.tdsAmount,
      supplierId: d.supplierId,
      payeeName: d.payeeName,
      paymentMode: d.paymentMode,
      bankAccount: d.bankAccount,
      chequeNo: d.chequeNo,
      chequeDate,
      chequePhotoUrl: d.chequePhotoUrl,
      referenceNo: d.referenceNo,
      receiptUrl: d.receiptUrl,
      date: expenseDate ?? undefined,
      notes: d.notes,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/expenses");
  revalidatePath("/m/expenses");
    revalidatePath("/m/accounts?tab=expenses");
  return json({ ok: true, id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  try {
    await deleteExpense(id, company.id, user.id);
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/expenses");
  revalidatePath("/m/expenses");
    revalidatePath("/m/accounts?tab=expenses");
  revalidatePath("/approvals");
  revalidatePath("/finance");
  return json({ ok: true });
});
