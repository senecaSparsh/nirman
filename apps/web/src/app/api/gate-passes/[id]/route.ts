import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  submitGatePass,
  approveGatePass,
  rejectGatePass,
  resubmitGatePass,
  confirmExit,
  cancelGatePass,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";

/**
 * GET /api/gate-passes/[id]
 * Get a single gate pass with full details.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.GATE_PASS_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const gp = await prisma.gatePass.findFirst({
    where: { id, companyId: company.id },
    include: {
      lines: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
      location: { select: { id: true, name: true, type: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      exitedBy: { select: { id: true, name: true } },
    },
  });

  if (!gp) return json({ error: "Gate pass not found" }, { status: 404 });

  return json({
    ...gp,
    lines: gp.lines.map((l) => ({ ...l, qty: toNum(l.qty) })),
  });
});

/**
 * PATCH /api/gate-passes/[id]
 * Action-based PATCH for workflow transitions.
 * Body: { action: "submit" | "approve" | "reject" | "confirmExit" | "cancel", ... }
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  // Verify company membership for all actions
  const company = await getCompany();
  const existing = await prisma.gatePass.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });
  if (!existing) return json({ error: "Gate pass not found" }, { status: 404 });

  if (action === "submit") {
    const user = await requirePermission(PERM.GATE_PASS_CREATE);
    await submitGatePass(id, user.id);
  } else if (action === "approve") {
    const user = await requirePermission(PERM.GATE_PASS_APPROVE);
    await approveGatePass(id, user.id, body?.notes);
  } else if (action === "reject") {
    const user = await requirePermission(PERM.GATE_PASS_APPROVE);
    if (!body?.reason?.trim()) return json({ error: "Rejection reason is required" }, { status: 400 });
    await rejectGatePass(id, user.id, body.reason.trim());
  } else if (action === "resubmit") {
    const user = await requirePermission(PERM.GATE_PASS_CREATE);
    await resubmitGatePass(id, user.id, body?.notes);
  } else if (action === "confirmExit") {
    const user = await requirePermission(PERM.GATE_PASS_EXIT);
    await confirmExit(id, user.id, {
      exitNotes: body?.exitNotes,
      exitPhotos: body?.exitPhotos,
    });
  } else if (action === "cancel") {
    const user = await requirePermission(PERM.GATE_PASS_MANAGE);
    await cancelGatePass(id, user.id);
  } else {
    return json({ error: "Unknown action" }, { status: 400 });
  }

  revalidatePath("/gate-passes");
  revalidatePath("/m/gate-pass");
  revalidatePath(`/api/gate-passes/${id}`);
  return json({ ok: true });
});
