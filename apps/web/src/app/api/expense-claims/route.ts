import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createExpenseClaim, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requireAnyPermission, scopeWhere, assertScopeAllows, getActingRole,} from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { z } from "zod";

const claimSchema = z.object({
  claimantId: z.string().min(1, "Claimant is required"),
  projectId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  const company = await getCompany();
  const user = await requireAnyPermission(PERM.FINANCE_VIEW, PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const canSeeAll = hasPermission(await getActingRole(), PERM.FINANCE_VIEW);
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
    createdAt: c.createdAt.toISOString(),
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const company = await getCompany();
  const user = await requireAnyPermission(PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const body = await req.json();
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Self-service claimants can only file for themselves; expense.create
  // holders (finance/admin) may file on behalf of another employee.
  const claimantId = hasPermission(await getActingRole(), PERM.EXPENSE_CREATE)
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
    });
    revalidatePath("/expense-claims");
    return json({ ok: true, id: claim.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
