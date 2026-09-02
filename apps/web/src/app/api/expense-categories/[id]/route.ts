import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateExpenseCategory, deleteExpenseCategory, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  glAccountCode: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  // isActive toggle handled directly (not in the service update)
  if (d.isActive !== undefined && Object.keys(d).length === 1) {
    await prisma.expenseCategory.updateMany({ where: { id, companyId: company.id }, data: { isActive: d.isActive } });
    revalidatePath("/expenses");
    revalidatePath("/expense-categories");
    return json({ ok: true });
  }
  try {
    await updateExpenseCategory(id, {
      companyId: company.id,
      name: d.name,
      glAccountCode: d.glAccountCode,
      description: d.description,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return json({ error: "A category with that name already exists" }, { status: 409 });
    }
    throw err;
  }
  revalidatePath("/expenses");
  revalidatePath("/expense-categories");
  return json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  try {
    await deleteExpenseCategory(id, company.id, user.id);
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/expenses");
  revalidatePath("/expense-categories");
  return json({ ok: true });
});
