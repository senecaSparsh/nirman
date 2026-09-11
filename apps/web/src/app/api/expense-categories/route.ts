import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createExpenseCategory, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  glAccountCode: z.string().min(1, "GL account code is required"),
  description: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const cats = await prisma.expenseCategory.findMany({
    where: { companyId: company.id },
    orderBy: { name: "asc" },
  });
  return json(cats.map((c) => ({
    id: c.id,
    name: c.name,
    glAccountCode: c.glAccountCode,
    description: c.description,
    isActive: c.isActive,
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const cat = await createExpenseCategory({
      companyId: company.id,
      name: parsed.data.name,
      glAccountCode: parsed.data.glAccountCode,
      description: parsed.data.description ?? null,
      userId: user.id,
    });
    revalidatePath("/expenses");
    revalidatePath("/expense-categories");
    return json({ ok: true, id: cat.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    // Prisma unique-constraint violation → friendly message
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return json({ error: "A category with that name already exists" }, { status: 409 });
    }
    throw err;
  }
});
