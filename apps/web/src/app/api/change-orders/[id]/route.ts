import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  getChangeOrder,
  updateChangeOrder,
  submitChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  cancelChangeOrder,
  implementChangeOrder,
  deleteChangeOrder,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const lineSchema = z.object({
  boqItemId: z.string().optional().nullable(),
  description: z.string().min(1),
  originalQty: z.coerce.number().optional().default(0),
  revisedQty: z.coerce.number().optional().default(0),
  unit: z.string().min(1),
  rate: z.coerce.number(),
  notes: z.string().optional().nullable(),
  sortOrder: z.coerce.number().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: z.enum(["ADDITION", "DELETION", "MODIFICATION", "ACCELERATION", "DECELERATION", "VARIATION"]).optional(),
  reason: z.enum(["CLIENT_REQUEST", "SITE_CONDITION", "DESIGN_CHANGE", "ERROR_OMISSION", "REGULATORY", "VALUE_ENGINEERING", "OTHER"]).optional(),
  scheduleDeltaDays: z.coerce.number().optional(),
  clientApprovalRequired: z.boolean().optional(),
  initiatedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
});

const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "cancel", "implement", "delete"]),
  reason: z.string().optional(),
  clientApprovedBy: z.string().optional(),
});

// GET /api/change-orders/[id]
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;
  const co = await getChangeOrder(id);
  if (!co) return json({ error: "Change order not found" }, { status: 404 });
  return json(co);
});

// PATCH /api/change-orders/[id] — update (DRAFT/REJECTED) or workflow action
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();

  // Verify ownership
  const existing = await prisma.changeOrder.findUnique({
    where: { id },
    select: { companyId: true, status: true },
  });
  if (!existing) return json({ error: "Change order not found" }, { status: 404 });
  if (existing.companyId !== company.id) {
    return json({ error: "Change order does not belong to your company" }, { status: 403 });
  }

  // Check if this is a workflow action
  if (body.action && typeof body.action === "string") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    }
    try {
      switch (parsed.data.action) {
        case "submit":
          return json(await submitChangeOrder(id, user.id));
        case "approve":
          return json(await approveChangeOrder(id, user.id, parsed.data.clientApprovedBy));
        case "reject":
          if (!parsed.data.reason) return json({ error: "Rejection reason is required" }, { status: 400 });
          return json(await rejectChangeOrder(id, user.id, parsed.data.reason));
        case "cancel":
          return json(await cancelChangeOrder(id, user.id));
        case "implement":
          return json(await implementChangeOrder(id, user.id));
        case "delete":
          await deleteChangeOrder(id, user.id);
          return json({ ok: true });
      }
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }

  // Regular update
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const updated = await updateChangeOrder(id, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      reason: parsed.data.reason,
      scheduleDeltaDays: parsed.data.scheduleDeltaDays,
      clientApprovalRequired: parsed.data.clientApprovalRequired,
      initiatedBy: parsed.data.initiatedBy,
      notes: parsed.data.notes,
      lines: parsed.data.lines,
      userId: user.id,
    });
    return json(updated);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

// DELETE /api/change-orders/[id]
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  const existing = await prisma.changeOrder.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!existing) return json({ error: "Change order not found" }, { status: 404 });
  if (existing.companyId !== company.id) {
    return json({ error: "Change order does not belong to your company" }, { status: 403 });
  }

  try {
    await deleteChangeOrder(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
