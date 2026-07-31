import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const companyUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().optional(),
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = companyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.company.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true },
  });
  return json(updated);
});
