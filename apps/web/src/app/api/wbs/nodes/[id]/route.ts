import { NextRequest } from "next/server";
import { updateWbsNode, deleteWbsNode } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, assertScopeAllows, getCompany, scopeWhere, requireEffectivePermission} from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireEffectivePermission(PERM.WBS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.wbsNode.findFirst({ where: { id, project: { companyId: company.id }, ...await scopeWhere("WbsNode") }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  try {
    await assertScopeAllows({ projectId: body?.projectId ?? null, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  // Convert date strings to Date, preserve null (clear), drop undefined (don't touch)
  const toDate = (v: unknown) => (v == null ? (v === null ? null : undefined) : new Date(v as string));
  try {
    const node = await updateWbsNode(id, {
      ...body,
      plannedStart: toDate(body.plannedStart),
      plannedEnd: toDate(body.plannedEnd),
      actualStart: toDate(body.actualStart),
      actualEnd: toDate(body.actualEnd),
      userId: user.id,
    });
    // Milestone closed → the linked CLP installments are due NOW, not whenever
    // the reminder sweep next runs. Dispatch one demand per newly-due item;
    // per-item failures never break the milestone update that just committed.
    const milestoneHit = (body.actualEnd != null) || (body.progressPct != null && Number(body.progressPct) >= 100);
    if (milestoneHit) {
      const dueItems = await prisma.paymentScheduleItem.findMany({
        where: { wbsNodeId: id, status: "DUE" },
        select: { id: true },
      });
      const { sendDemandNotice } = await import("@nirman/services");
      for (const item of dueItems) {
        try { await sendDemandNotice(item.id, company.id, user.id); } catch { /* demand failure never fails the milestone */ }
      }
    }
    return json(node);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireEffectivePermission(PERM.WBS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.wbsNode.findFirst({ where: { id, project: { companyId: company.id }, ...await scopeWhere("WbsNode") }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  try {
    await deleteWbsNode(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
