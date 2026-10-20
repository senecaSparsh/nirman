import { NextRequest } from "next/server";
import { waiveScheduleItem } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  reason: z.string().max(300).optional(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.paymentScheduleItem.findFirst({
    where: { id, paymentSchedule: { assetSale: { companyId: company.id } } },
    select: { id: true },
  });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const result = await waiveScheduleItem(id, parsed.data.reason, user.id);
    return json(result);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
