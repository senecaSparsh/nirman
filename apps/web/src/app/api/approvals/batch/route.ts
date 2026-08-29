import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { approvePurchaseOrder } from "@nirman/services";
import { apiHandler, getCompany, getUserPermissions, json, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * POST /api/approvals/batch
 * Body: { items: [{ type: "po" | "requisition" | "gatePass", id: string }] }
 *
 * Batch-approves multiple items in sequence. Returns per-item results.
 * If some items fail (e.g. already approved, permission error), the rest
 * still succeed — partial success is reported.
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
        // Verify the PO belongs to this company and is in DRAFT status
        const po = await prisma.purchaseOrder.findFirst({
          where: { id: item.id, companyId: company.id, status: "DRAFT" },
          select: { id: true, poNumber: true },
        });
        if (!po) {
          results.push({ type: item.type, id: item.id, success: false, error: "PO not found or not in DRAFT status" });
          continue;
        }
        await approvePurchaseOrder(item.id, user.id);
        results.push({ type: item.type, id: item.id, success: true });
      } else if (item.type === "requisition") {
        if (!canApproveReq) {
          results.push({ type: item.type, id: item.id, success: false, error: "No permission to approve requisitions" });
          continue;
        }
        const req = await prisma.materialRequisition.findFirst({
          where: { id: item.id, project: { companyId: company.id }, status: "SUBMITTED" },
          select: { id: true, reqNumber: true },
        });
        if (!req) {
          results.push({ type: item.type, id: item.id, success: false, error: "Requisition not found or not in SUBMITTED status" });
          continue;
        }
        await prisma.materialRequisition.update({
          where: { id: item.id },
          data: {
            status: "APPROVED",
            approvedById: user.id,
            approvedAt: new Date(),
          },
        });
        results.push({ type: item.type, id: item.id, success: true });
      } else if (item.type === "gatePass") {
        if (!canApproveGp) {
          results.push({ type: item.type, id: item.id, success: false, error: "No permission to approve gate passes" });
          continue;
        }
        const gp = await prisma.gatePass.findFirst({
          where: { id: item.id, companyId: company.id, status: "PENDING" },
          select: { id: true, gatePassNumber: true },
        });
        if (!gp) {
          results.push({ type: item.type, id: item.id, success: false, error: "Gate pass not found or not in PENDING status" });
          continue;
        }
        await prisma.gatePass.update({
          where: { id: item.id },
          data: {
            status: "APPROVED",
            approvedById: user.id,
            approvedAt: new Date(),
          },
        });
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

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  return json({
    results,
    summary: { total: results.length, succeeded, failed },
  });
});
