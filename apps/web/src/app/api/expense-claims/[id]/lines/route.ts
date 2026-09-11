import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addClaimLine, removeClaimLine, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const lineSchema = z.object({
  categoryId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  gstRate: z.coerce.number().min(0).max(28).optional().nullable(),
  date: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = lineSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    await addClaimLine({
      claimId: id,
      companyId: company.id,
      categoryId: d.categoryId ?? null,
      category: d.category,
      amount: d.amount,
      gstRate: d.gstRate ?? null,
      date: d.date ? new Date(d.date) : undefined,
      receiptUrl: d.receiptUrl ?? null,
      notes: d.notes ?? null,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/expense-claims");
  return json({ ok: true }, { status: 201 });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();
  await params; // validate the route param exists
  const lineId = new URL(req.url).searchParams.get("lineId");
  if (!lineId) return json({ error: "lineId query param is required" }, { status: 400 });
  try {
    await removeClaimLine(lineId, company.id, user.id);
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/expense-claims");
  return json({ ok: true });
});
