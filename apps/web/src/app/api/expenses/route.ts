import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createExpense, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";
import { parseCursorParams, cursorToWhere, buildCursorResponse } from "@/lib/cursor-pagination";

const expenseSchema = z.object({
  projectId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  subtotal: z.coerce.number().finite().nonnegative().optional(),
  cgst: z.coerce.number().finite().nonnegative().optional(),
  sgst: z.coerce.number().finite().nonnegative().optional(),
  igst: z.coerce.number().finite().nonnegative().optional(),
  tdsAmount: z.coerce.number().finite().nonnegative().optional(),
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
  submitForApproval: z.boolean().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const categoryId = searchParams.get("categoryId");
  const supplierId = searchParams.get("supplierId");

  // Cursor pagination — backward compatible. If `cursor` param is present,
  // return { items, nextCursor, hasMore }. Otherwise return flat array.
  const { take, cursor, skip } = parseCursorParams(req);
  const usePagination = searchParams.has("cursor") || searchParams.has("take");

  const expenses = await prisma.expense.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(cursorToWhere(cursor, "date") ?? {}),
      ...await scopeWhere("Expense", {}),
    },
    orderBy: { date: "desc" },
    take: usePagination ? take + 1 : undefined,
    skip: usePagination ? skip : undefined,
    include: {
      project: { select: { id: true, name: true } },
      categoryMaster: { select: { id: true, name: true, glAccountCode: true } },
      supplier: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });

  const mapped = expenses.map((e) => ({
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
    date: e.date.toISOString(),
    notes: e.notes,
  }));

  if (usePagination) {
    const { items, nextCursor, hasMore } = buildCursorResponse(mapped, take, (r) => ({
      createdAt: r.date,
      id: r.id,
    }));
    return NextResponse.json({ items, nextCursor, hasMore });
  }
  return json(mapped);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
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
  const expenseDate = d.date ? new Date(d.date) : new Date();
  if (isNaN(expenseDate.getTime())) {
    return json({ error: "Invalid date format" }, { status: 400 });
  }
  const chequeDate = d.chequeDate ? new Date(d.chequeDate) : null;
  if (d.chequeDate && isNaN(chequeDate!.getTime())) {
    return json({ error: "Invalid cheque date format" }, { status: 400 });
  }

  try {
    const expense = await createExpense({
      companyId: company.id,
      projectId: d.projectId ?? null,
      categoryId: d.categoryId ?? null,
      category: d.category,
      amount: d.amount,
      subtotal: d.subtotal,
      cgst: d.cgst,
      sgst: d.sgst,
      igst: d.igst,
      tdsAmount: d.tdsAmount,
      supplierId: d.supplierId ?? null,
      payeeName: d.payeeName ?? null,
      paymentMode: d.paymentMode ?? null,
      bankAccount: d.bankAccount ?? null,
      chequeNo: d.chequeNo ?? null,
      chequeDate,
      chequePhotoUrl: d.chequePhotoUrl ?? null,
      referenceNo: d.referenceNo ?? null,
      receiptUrl: d.receiptUrl ?? null,
      date: expenseDate,
      notes: d.notes ?? null,
      submitForApproval: d.submitForApproval,
      userId: user.id,
    });
    revalidatePath("/expenses");
    revalidatePath("/m/expenses");
    revalidatePath("/m/accounts?tab=expenses");
    revalidatePath("/approvals");
    return json({ ok: true, id: expense.id, status: expense.status }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return json({ error: "id query param is required" }, { status: 400 });
  const { deleteExpense } = await import("@nirman/services");
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
  return json({ ok: true });
});
