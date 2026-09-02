import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createRecurringExpense, generateDueRecurringExpenses, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const recurringSchema = z.object({
  projectId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().nullable(),
  payeeName: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  paymentMode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const items = await prisma.recurringExpense.findMany({
    where: { companyId: company.id },
    orderBy: { nextRunDate: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      categoryMaster: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });
  return json(items.map((r) => ({
    id: r.id,
    category: r.category,
    categoryName: r.categoryMaster?.name ?? null,
    amount: toNum(r.amount),
    frequency: r.frequency,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate?.toISOString() ?? null,
    nextRunDate: r.nextRunDate.toISOString(),
    lastRunDate: r.lastRunDate?.toISOString() ?? null,
    isActive: r.isActive,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    payeeName: r.payeeName,
    supplierId: r.supplierId,
    supplierName: r.supplier?.name ?? null,
    paymentMode: r.paymentMode,
    notes: r.notes,
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = recurringSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const recurring = await createRecurringExpense({
      companyId: company.id,
      projectId: d.projectId ?? null,
      categoryId: d.categoryId ?? null,
      category: d.category,
      amount: d.amount,
      frequency: d.frequency,
      startDate: new Date(d.startDate),
      endDate: d.endDate ? new Date(d.endDate) : null,
      payeeName: d.payeeName ?? null,
      supplierId: d.supplierId ?? null,
      paymentMode: d.paymentMode ?? null,
      notes: d.notes ?? null,
      userId: user.id,
    });
    revalidatePath("/recurring-expenses");
    return NextResponse.json({ ok: true, id: recurring.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});

/** POST /api/recurring-expenses?generate=true — generate due draft expenses. */
export const PATCH = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const generate = new URL(req.url).searchParams.get("generate") === "true";
  if (!generate) return json({ error: "Unsupported PATCH" }, { status: 400 });
  const result = await generateDueRecurringExpenses(company.id);
  revalidatePath("/recurring-expenses");
  revalidatePath("/expenses");
  return json({ ok: true, generated: result.count });
});
