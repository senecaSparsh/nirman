import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createExpenseClaim, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const claimSchema = z.object({
  claimantId: z.string().min(1, "Claimant is required"),
  projectId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const claims = await prisma.expenseClaim.findMany({
    where: { companyId: company.id, ...await scopeWhere("ExpenseClaim", {}) },
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
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
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
      claimantId: parsed.data.claimantId,
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
