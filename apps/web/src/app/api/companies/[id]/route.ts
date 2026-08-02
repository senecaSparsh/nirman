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
  businessType: z.string().optional().nullable(),
  parentCompanyId: z.string().optional().nullable(),
});

/**
 * PATCH /api/companies/[id] — update a company's profile or hierarchy.
 * Setting parentCompanyId to null detaches it from its parent. A company
 * cannot be its own parent (cycle guard).
 */
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = companyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  // Cycle guard: a company cannot be its own parent.
  if (data.parentCompanyId && data.parentCompanyId === id) {
    return json({ error: "A company cannot be its own parent" }, { status: 400 });
  }
  // Validate parent exists if provided.
  if (data.parentCompanyId) {
    const parent = await prisma.company.findFirst({
      where: { id: data.parentCompanyId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) return json({ error: "Parent company not found" }, { status: 400 });
  }

  const updated = await prisma.company.update({
    where: { id },
    data,
    select: { id: true, name: true },
  });
  return json(updated);
});

/**
 * DELETE /api/companies/[id] — soft-delete a company. OWNER/ADMIN only.
 * Refuses if the company still has children (must re-parent or delete
 * children first) so the hierarchy never has dangling references.
 */
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;

  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, _count: { select: { children: true } } },
  });
  if (!existing || existing.deletedAt) {
    return json({ error: "Company not found" }, { status: 404 });
  }
  if (existing._count.children > 0) {
    return json({ error: "Re-parent or delete child companies first" }, { status: 400 });
  }

  await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
  return json({ ok: true });
});

