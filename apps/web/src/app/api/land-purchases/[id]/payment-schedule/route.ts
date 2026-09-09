import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createLandPaymentSchedule, getLandPaymentSchedule } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/land-purchases/[id]/payment-schedule — fetch the payment schedule.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;

  const company = await getCompany();
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const schedule = await getLandPaymentSchedule(id);
  return json(schedule);
});

/**
 * POST /api/land-purchases/[id]/payment-schedule — create or replace the payment schedule.
 * Body: { items: [{ installmentNo, description, percentage, dueDate? }] }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;

  const company = await getCompany();
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "At least one payment schedule item is required" }, { status: 400 });
  }

  try {
    const schedule = await createLandPaymentSchedule({
      landPurchaseId: id,
      items: body.items,
      userId: user.id,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    revalidatePath(`/m/land/${id}`);
    return json({ ok: true, schedule }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create payment schedule") }, { status: 400 });
  }
});
