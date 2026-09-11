import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { approvePurchaseOrder, approveGatePass, approveRequisition } from "@nirman/services";
import { apiHandler, getCompany, getUserPermissions, json, requireUser, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * POST /api/approvals/batch
 * Body: { items: [{ type: "po" | "requisition" | "gatePass", id: string }] }
 *
 * Batch-approves multiple items. Returns per-item results.
 * If some items fail (e.g. already approved, permission error), the rest
 * still succeed — partial success is reported.
 *
 * Optimization: pre-fetch all candidate IDs in bulk (one query per type)
 * instead of N+1 individual findFirst calls inside the loop.
 */
const batchSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum(["po", "requisition", "gatePass"]),
      id: z.string().min(1),
    }),
  ).min(1).max(50),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const perms = await getUserPermissions();
  const company = await getCompany();

  const body = await req.json();
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const canApprovePo = perms.includes(PERM.PO_APPROVE);
  const canApproveReq = perms.includes(PERM.REQUISITION_APPROVE);
  const canApproveGp = perms.includes(PERM.GATE_PASS_APPROVE);

  // ── Partition items by type ───────────────────────────────────────
  const poIds: string[] = [];
  const reqIds: string[] = [];
  const gpIds: string[] = [];
  for (const item of parsed.data.items) {
    if (item.type === "po") poIds.push(item.id);
    else if (item.type === "requisition") reqIds.push(item.id);
    else if (item.type === "gatePass") gpIds.push(item.id);
  }

  // ── Bulk-fetch valid candidates (one query per type, not N+1) ─────
  const reqScope = await scopeWhere("MaterialRequisition", {});
  const gpScope = await scopeWhere("GatePass", {});
  const [validPos, validReqs, validGps] = await Promise.all([
    canApprovePo && poIds.length > 0
      ? prisma.purchaseOrder.findMany({
          where: { id: { in: poIds }, companyId: company.id, status: "DRAFT", createdById: { not: user.id } },
          select: { id: true },
        })
      : Promise.resolve([]),
    canApproveReq && reqIds.length > 0
      ? prisma.materialRequisition.findMany({
          where: { id: { in: reqIds }, project: { companyId: company.id }, status: "SUBMITTED", requestedById: { not: user.id }, ...reqScope },
          select: { id: true },
        })
      : Promise.resolve([]),
    canApproveGp && gpIds.length > 0
      ? prisma.gatePass.findMany({
          where: { id: { in: gpIds }, companyId: company.id, status: "PENDING", createdById: { not: user.id }, ...gpScope },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const validPoIds = new Set(validPos.map((p) => p.id));
  const validReqIds = new Set(validReqs.map((r) => r.id));
  const validGpIds = new Set(validGps.map((g) => g.id));

  // ── Process each item ─────────────────────────────────────────────
  const results: Array<{
    type: string;
    id: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const item of parsed.data.items) {
    try {
      if (item.type === "po") {
        if (!canApprovePo) {
          results.push({ type: item.type, id: item.id, success: false, error: "No permission to approve POs" });
          continue;
        }
        if (!validPoIds.has(item.id)) {
          results.push({ type: item.type, id: item.id, success: false, error: "PO not found, not in DRAFT status, or you cannot approve your own PO" });
          continue;
        }
        await approvePurchaseOrder(item.id, user.role, user.id);
        results.push({ type: item.type, id: item.id, success: true });
      } else if (item.type === "requisition") {
        if (!canApproveReq) {
          results.push({ type: item.type, id: item.id, success: false, error: "No permission to approve indents" });
          continue;
        }
        if (!validReqIds.has(item.id)) {
          results.push({ type: item.type, id: item.id, success: false, error: "Indent not found, not submitted, or you cannot approve your own indent" });
          continue;
        }
        await approveRequisition(item.id, user.id);
        results.push({ type: item.type, id: item.id, success: true });
      } else if (item.type === "gatePass") {
        if (!canApproveGp) {
          results.push({ type: item.type, id: item.id, success: false, error: "No permission to approve gate passes" });
          continue;
        }
        if (!validGpIds.has(item.id)) {
          results.push({ type: item.type, id: item.id, success: false, error: "Gate pass not found, not pending, or you cannot approve your own gate pass" });
          continue;
        }
        await approveGatePass(item.id, user.id);
        results.push({ type: item.type, id: item.id, success: true });
      }
    } catch (err) {
      results.push({
        type: item.type,
        id: item.id,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // ── Revalidate all affected pages ─────────────────────────────────
  const anyPo = results.some((r) => r.type === "po" && r.success);
  const anyReq = results.some((r) => r.type === "requisition" && r.success);
  const anyGp = results.some((r) => r.type === "gatePass" && r.success);

  revalidatePath("/approvals");
    revalidatePath("/m/approvals");
  if (anyPo) {
    revalidatePath("/procurement");
    revalidatePath("/m/procurement");
  }
  if (anyReq) {
    revalidatePath("/requisitions");
    revalidatePath("/m/procurement");
  }
  if (anyGp) {
    revalidatePath("/gate-passes");
    revalidatePath("/m/gate-passes");
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  return json({
    results,
    summary: { total: results.length, succeeded, failed },
  });
});
