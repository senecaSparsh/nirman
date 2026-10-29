import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createExpenseClaim, submitExpenseClaim, approveExpenseClaim, canWaiveSelfApproval, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, scopeWhere, assertScopeAllows, getActingRole, getUserPermissions, requireAnyEffectivePermission} from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const claimLineSchema = z.object({
  categoryId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  gstRate: z.coerce.number().min(0).max(28).optional().nullable(),
  date: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const claimSchema = z.object({
  claimantId: z.string().min(1, "Claimant is required"),
  projectId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  // Optional atomic create: header + lines (+ optional submit) in one request,
  // so an interrupted multi-step client flow can't leave a line-less draft.
  lines: z.array(claimLineSchema).optional(),
  submit: z.boolean().optional(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  const company = await getCompany();
  const user = await requireAnyEffectivePermission(PERM.FINANCE_VIEW, PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const canSeeAll = (await getUserPermissions()).includes(PERM.FINANCE_VIEW);
  const claims = await prisma.expenseClaim.findMany({
    where: {
      companyId: company.id,
      ...await scopeWhere("ExpenseClaim", {}),
      // Self-service claimants see only their own claims.
      ...(canSeeAll ? {} : { claimantId: user.id }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      claimant: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      lines: true,
    },
  });
  // Outstanding employee advance per claimant — lets the pay dialog offer
  // imprest netting (settle the claim against an open advance) when one
  // exists. Two batched lookups, not a per-row query.
  const claimantIds = [...new Set(claims.map((c) => c.claimantId))];
  const claimantEmployees = await prisma.employee.findMany({
    where: { userId: { in: claimantIds }, companyId: company.id, deletedAt: null },
    select: { id: true, userId: true },
  });
  const empIdByUser = new Map(claimantEmployees.map((e) => [e.userId, e.id]));
  const openAdvances = await prisma.employeeAdvance.findMany({
    where: { employeeId: { in: claimantEmployees.map((e) => e.id) }, status: "ACTIVE" },
    select: { employeeId: true, amount: true, recoveredAmount: true },
  });
  const outstandingByEmp = new Map<string, number>();
  for (const a of openAdvances) {
    outstandingByEmp.set(a.employeeId, (outstandingByEmp.get(a.employeeId) ?? 0) + (toNum(a.amount) - toNum(a.recoveredAmount)));
  }
  return json(claims.map((c) => ({
    id: c.id,
    claimantId: c.claimantId,
    claimantName: c.claimant.name,
    projectId: c.projectId,
    projectName: c.project?.name ?? null,
    status: c.status,
    totalAmount: toNum(c.totalAmount),
    description: c.description,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    paidAt: c.paidAt?.toISOString() ?? null,
    paymentMode: c.paymentMode,
    referenceNo: c.referenceNo,
    lineCount: c.lines.length,
    advanceOutstanding: (() => {
      const empId = empIdByUser.get(c.claimantId);
      return empId ? (outstandingByEmp.get(empId) ?? 0) : 0;
    })(),
    createdAt: c.createdAt.toISOString(),
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const company = await getCompany();
  const user = await requireAnyEffectivePermission(PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const body = await req.json();
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Self-service claimants can only file for themselves; expense.create
  // holders (finance/admin) may file on behalf of another employee.
  const claimantId = (await getUserPermissions()).includes(PERM.EXPENSE_CREATE)
    ? parsed.data.claimantId
    : user.id;
  try {
    await assertScopeAllows({
      projectId: parsed.data.projectId ?? null,
      departmentId: null,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Scope violation" },
      { status: 403 },
    );
  }
  try {
    const claim = await createExpenseClaim({
      companyId: company.id,
      claimantId,
      projectId: parsed.data.projectId ?? null,
      description: parsed.data.description ?? null,
      userId: user.id,
      lines: parsed.data.lines?.map((l) => ({
        categoryId: l.categoryId ?? null,
        category: l.category,
        amount: l.amount,
        gstRate: l.gstRate ?? null,
        date: l.date ? new Date(l.date) : undefined,
        receiptUrl: l.receiptUrl ?? null,
        notes: l.notes ?? null,
      })),
    });
    // Auto-submit when the client asked for it — keeps the whole
    // create→lines→submit lifecycle in one atomic request.
    let autoApproved = false;
    if (parsed.data.submit) {
      await submitExpenseClaim(claim.id, company.id, user.id);
      // Same rule as PATCH submit: tier-1 creators (OWNER/ADMIN) auto-approve —
      // no higher approver exists above them.
      if (canWaiveSelfApproval(await getActingRole())) {
        await approveExpenseClaim(claim.id, company.id, user.id, await getActingRole());
        autoApproved = true;
      }
    }
    revalidatePath("/expense-claims");
  revalidatePath("/m/expense-claims");
    return json({ ok: true, id: claim.id, submitted: !!parsed.data.submit, approved: autoApproved }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
