import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { addLandCostComponent, scheduledTotal } from "@nirman/services";
import Decimal from "decimal.js";
import { apiHandler, getCompany, json, toNum, landCostComponentSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;

  const lp = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!lp) return json({ error: "Land purchase not found" }, { status: 404 });

  const components = await prisma.landCostComponent.findMany({
    where: { landPurchaseId: id },
    orderBy: { createdAt: "asc" },
  });

  return json(
    components.map((c) => ({
      id: c.id,
      landPurchaseId: c.landPurchaseId,
      label: c.label,
      amount: toNum(c.amount),
      frequency: c.frequency,
      interval: c.interval,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate ? c.endDate.toISOString() : null,
      occurrences: c.occurrences,
      postedAmount: toNum(c.postedAmount),
      scheduledTotal: toNum(scheduledTotal(c)),
      notes: c.notes,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  const lp = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!lp) return json({ error: "Land purchase not found" }, { status: 404 });

  const body = await req.json();
  const parsed = landCostComponentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  if (d.frequency === "RECURRING" && !d.interval) {
    return json({ error: "Interval is required for recurring costs" }, { status: 400 });
  }

  const startDate = d.startDate ? new Date(d.startDate) : new Date();
  if (isNaN(startDate.getTime())) return json({ error: "Invalid start date" }, { status: 400 });
  const endDate = d.endDate ? new Date(d.endDate) : null;
  if (endDate && isNaN(endDate.getTime())) return json({ error: "Invalid end date" }, { status: 400 });

  try {
    const component = await addLandCostComponent({
      landPurchaseId: id,
      label: d.label,
      amount: new Decimal(d.amount),
      frequency: d.frequency,
      interval: d.interval ?? null,
      startDate,
      endDate,
      occurrences: d.occurrences ?? null,
      notes: d.notes ?? undefined,
      userId: user.id,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    revalidatePath("/m/land");
    revalidatePath("/m/real-estate?tab=land");
    revalidatePath(`/m/land/${id}`);
    return json({ ok: true, id: component.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to add cost component") }, { status: 400 });
  }
});
