import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createRateContract, getRateContracts } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  supplierId: z.string().min(1),
  materialId: z.string().min(1),
  agreedRate: z.coerce.number().min(0.01),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  minQty: z.coerce.number().optional(),
  maxQty: z.coerce.number().optional(),
  notes: z.string().optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const contract = await createRateContract({
      supplierId: d.supplierId,
      companyId: company.id,
      materialId: d.materialId,
      agreedRate: d.agreedRate,
      validFrom: new Date(d.validFrom),
      validTo: new Date(d.validTo),
      minQty: d.minQty,
      maxQty: d.maxQty,
      notes: d.notes ?? undefined,
      userId: user.id,
    });
    return json(contract, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const contracts = await getRateContracts(company.id);
  return json(contracts.map((c) => ({
    ...c,
    agreedRate: toNum(c.agreedRate),
    minQty: c.minQty ? toNum(c.minQty) : null,
    maxQty: c.maxQty ? toNum(c.maxQty) : null,
    totalReleasedQty: toNum(c.totalReleasedQty),
  })));
});
