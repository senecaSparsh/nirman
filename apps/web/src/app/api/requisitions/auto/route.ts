import { NextRequest } from "next/server";
import { generateAutoRequisition } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * POST /api/requisitions/auto
 * Body: { projectId: string, neededByDate?: string }
 *
 * Generates a DRAFT Material Requisition for all materials whose total stock
 * has dropped to or below their reorderPoint (operationalizing the EOQ/reorder
 * fields). De-duplicates against already-open requisitions. The generated
 * requisition stays in DRAFT — a human still reviews and submits it.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const projectId = body?.projectId as string | undefined;
  if (!projectId) {
    return json({ error: "projectId is required" }, { status: 400 });
  }
  const neededByDate = body?.neededByDate ? new Date(body.neededByDate) : undefined;

  try {
    const result = await generateAutoRequisition({
      companyId: company.id,
      projectId,
      createdByById: user.id,
      neededByDate,
    });

    if (!result) {
      return json({
        ok: true,
        generated: false,
        message: "No materials are below their reorder point.",
      });
    }

    if (result.lineCount === 0) {
      return json({
        ok: true,
        generated: false,
        message: "All low-stock materials already have an open requisition.",
        skipped: result.skipped,
      });
    }

    return json(
      {
        ok: true,
        generated: true,
        requisitionId: result.requisitionId,
        reqNumber: result.reqNumber,
        lineCount: result.lineCount,
        lines: result.lines.map((l) => ({
          materialId: l.materialId,
          code: l.code,
          name: l.name,
          qtyRequested: l.qtyRequested.toString(),
          reason: l.reason,
        })),
        skipped: result.skipped,
      },
      { status: 201 },
    );
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to generate auto-requisition" }, { status: 400 });
  }
});
