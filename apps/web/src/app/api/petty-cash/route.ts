import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createPettyCashFloat, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const floatSchema = z.object({
  projectId: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  floatAmount: z.coerce.number().nonnegative("Float amount must be >= 0"),
  custodianId: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const floats = await prisma.pettyCashFloat.findMany({
    where: { companyId: company.id, ...await scopeWhere("PettyCashFloat", {}) },
    orderBy: { name: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      custodian: { select: { id: true, name: true } },
      topUps: { orderBy: { date: "desc" }, take: 10 },
    },
  });
  return json(floats.map((f) => ({
    id: f.id,
    name: f.name,
    projectId: f.projectId,
    projectName: f.project?.name ?? null,
    floatAmount: toNum(f.floatAmount),
    topUpTotal: toNum(f.topUpTotal),
    spentTotal: toNum(f.spentTotal),
    custodianId: f.custodianId,
    custodianName: f.custodian?.name ?? null,
    topUpCount: f.topUps.length,
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = floatSchema.safeParse(body);
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
    const float = await createPettyCashFloat({
      companyId: company.id,
      projectId: parsed.data.projectId ?? null,
      name: parsed.data.name,
      floatAmount: parsed.data.floatAmount,
      custodianId: parsed.data.custodianId ?? null,
      userId: user.id,
    });
    revalidatePath("/petty-cash");
    return NextResponse.json({ ok: true, id: float.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
