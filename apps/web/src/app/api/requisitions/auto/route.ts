import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { generateAutoRequisition, notifyLowStock } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";

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

    // Fire low-stock WhatsApp notifications to procurement managers
    // (best-effort — failures don't block the requisition)
    try {
      const managers = await prisma.user.findMany({
        where: {
          memberships: { some: { companyId: company.id, role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "PROCUREMENT_MANAGER"] } } },
          phone: { not: null },
          active: true,
        },
        select: { phone: true, name: true },
      });
      if (managers.length > 0) {
        // Batch-fetch all materials + stock aggregates in 2 queries instead of N×2
        const materialIds = result.lines.map((l) => l.materialId);
        const [materials, stockAgg] = await Promise.all([
          prisma.material.findMany({
            where: { id: { in: materialIds } },
            select: { id: true, code: true, name: true, unit: true, reorderPoint: true },
          }),
          prisma.stockLocationItem.groupBy({
            by: ["materialId"],
            where: { materialId: { in: materialIds }, location: { deletedAt: null } },
            _sum: { qty: true },
          }),
        ]);
        const materialMap = new Map(materials.map((m) => [m.id, m]));
        const stockMap = new Map(stockAgg.map((s) => [s.materialId, toNum(s._sum.qty ?? 0)]));
        for (const line of result.lines) {
          const material = materialMap.get(line.materialId);
          if (material) {
            await notifyLowStock(
              company.id,
              {
                id: line.materialId,
                code: material.code,
                name: material.name,
                unit: material.unit,
                totalQty: stockMap.get(line.materialId) ?? 0,
                reorderPoint: material.reorderPoint ? toNum(material.reorderPoint) : null,
              },
              managers.map((m) => ({ phone: m.phone!, name: m.name })),
            );
          }
        }
      }
    } catch { /* best-effort */ }

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
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to generate auto-requisition") }, { status: 400 });
  }
});
