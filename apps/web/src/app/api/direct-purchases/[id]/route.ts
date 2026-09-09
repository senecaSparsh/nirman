import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { cancelDirectPurchase, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/direct-purchases/[id] — fetch a single direct purchase by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const purchase = await prisma.directPurchase.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      location: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  if (!purchase) return json({ error: "Direct purchase not found" }, { status: 404 });
  return json(purchase);
});

/**
 * PATCH /api/direct-purchases/[id] — cancel a direct purchase.
 * Reverses stock (ADJUSTMENT_OUT) and GL entries.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body?.action as string;

  if (action === "cancel") {
    const company = await getCompany();
    const existing = await prisma.directPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!existing) return json({ error: "Direct purchase not found" }, { status: 404 });
    try {
      const result = await cancelDirectPurchase(id, user.id);
      revalidatePath("/procurement");
      revalidatePath("/m/procurement");
      return json({ id: result.id, status: result.status });
    } catch (err: unknown) {
      if (err instanceof ServiceError) {
        return json({ error: err.message }, { status: err.status ?? 400 });
      }
      return json({ error: "Failed to cancel direct purchase" }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
