import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { addClaimLine, removeClaimLine, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requireAnyPermission, scopeWhere, getActingRole,} from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
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

/** Self-service claimants (claim.create only) may only touch their own claims. */
async function assertClaimantAccess(claimId: string, companyId: string, user: { id: string; role: string | null }) {
  if (hasPermission(await getActingRole(), PERM.EXPENSE_CREATE)) return null;
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: claimId, companyId, ...await scopeWhere("ExpenseClaim") },
    select: { claimantId: true },
  });
  if (!claim) return json({ error: "Expense claim not found or out of scope" }, { status: 404 });
  if (claim.claimantId !== user.id) {
    return json({ error: "You can only edit your own claims" }, { status: 403 });
  }
  return null;
}

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireAnyPermission(PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const company = await getCompany();
  const { id } = await params;
  const denied = await assertClaimantAccess(id, company.id, user);
  if (denied) return denied;
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
  const user = await requireAnyPermission(PERM.EXPENSE_CREATE, PERM.CLAIM_CREATE);
  const company = await getCompany();
  const { id } = await params;
  const denied = await assertClaimantAccess(id, company.id, user);
  if (denied) return denied;
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
