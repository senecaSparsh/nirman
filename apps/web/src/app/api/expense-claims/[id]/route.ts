import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import {
  submitExpenseClaim,
  approveExpenseClaim,
  rejectExpenseClaim,
  payExpenseClaim,
  canAutoApprove,
  ServiceError,
} from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, requireAnyPermission, scopeWhere, getActingRole,} from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pay"]).optional(),
  rejectionReason: z.string().optional(),
  reason: z.string().optional(),
  paymentMode: z.string().optional(),
  referenceNo: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const company = await getCompany();
  const user = await requireAnyPermission(PERM.FINANCE_VIEW, PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const { id } = await params;
  const c = await prisma.expenseClaim.findFirst({
    where: {
      id,
      companyId: company.id,
      ...await scopeWhere("ExpenseClaim", {}),
      // Self-service claimants can read only their own claims.
      ...(hasPermission(await getActingRole(), PERM.FINANCE_VIEW) ? {} : { claimantId: user.id }),
    },
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
      const user = await requireAnyPermission(PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
      // Self-service claimants can submit only their own claims.
      if (!hasPermission(await getActingRole(), PERM.EXPENSE_CREATE) && existing.claimantId !== user.id) {
        return json({ error: "You can only submit your own claims" }, { status: 403 });
      }
      await submitExpenseClaim(id, company.id, user.id);
      // Tier-1 creators (OWNER/ADMIN) auto-approve — no higher approver exists
      // above them, so submitting their own claim completes it. Everyone else's
      // claim stays SUBMITTED for another approver.
      if (canAutoApprove(await getActingRole())) {
        await approveExpenseClaim(id, company.id, user.id, await getActingRole());
      }
    } else if (d.action === "approve") {
      const user = await requirePermission(PERM.EXPENSE_APPROVE);
      await approveExpenseClaim(id, company.id, user.id, await getActingRole());
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

/**
 * DELETE /api/expense-claims/[id] — remove a DRAFT claim. A draft never
 * reached approval, so it carries no financial/audit weight — hard delete
 * is safe (lines cascade, linked Expense rows just lose the claimId).
 * Claimants may delete their own drafts; EXPENSE_CREATE may delete any draft.
 * There's no CANCELLED status, so delete is the only way to clear a draft
 * created by mistake or abandoned mid-entry.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireAnyPermission(PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.expenseClaim.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("ExpenseClaim") },
    select: { id: true, status: true, claimantId: true },
  });
  if (!existing) return json({ error: "Expense claim not found or out of scope" }, { status: 404 });
  if (existing.status !== "DRAFT") {
    return json({ error: "Only draft claims can be deleted" }, { status: 409 });
  }
  // Self-service claimants can delete only their own drafts.
  if (!hasPermission(await getActingRole(), PERM.EXPENSE_CREATE) && existing.claimantId !== user.id) {
    return json({ error: "You can only delete your own claims" }, { status: 403 });
  }

  await prisma.expenseClaim.delete({ where: { id } });
  revalidatePath("/expense-claims");
  revalidatePath("/m/expense-claims");
  return json({ ok: true });
});
