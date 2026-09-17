import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * PATCH /api/goods-receipts/[id]
 * Body: { action: "inspect", verdict: "PASSED" | "FAILED", notes? }
 *
 * Records the post-receipt quality verdict on a GRN. The QC dashboard's
 * "Pending Inspections" queue lists receipts whose inspectionStatus is still
 * PENDING — until now there was no mutation path to flip them (inspection
 * could only be set inline at receive time), so the queue could never drain.
 * The verdict feeds the supplier quality score (procurement-advanced counts
 * PASSED receipts) so it must be settable after the fact too.
 *
 * Scope: the GRN carries no companyId — it's scoped via its location, which
 * is company-owned.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.QC_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body?.action !== "inspect") {
    return json({ error: "Unknown action. Use 'inspect'." }, { status: 400 });
  }
  const verdict = String(body?.verdict ?? "").toUpperCase();
  if (verdict !== "PASSED" && verdict !== "FAILED") {
    return json({ error: "verdict must be PASSED or FAILED" }, { status: 400 });
  }

  const grn = await prisma.goodsReceipt.findFirst({
    where: { id, location: { companyId: company.id }, ...await scopeWhere("GoodsReceipt") },
    select: { id: true, inspectionStatus: true },
  });
  if (!grn) return json({ error: "Goods receipt not found" }, { status: 404 });
  if (grn.inspectionStatus !== "PENDING") {
    return json({ error: `Receipt already inspected (${grn.inspectionStatus})` }, { status: 409 });
  }

  const updated = await prisma.goodsReceipt.update({
    where: { id },
    data: {
      inspectionStatus: verdict,
      inspectionNotes: body?.notes ? String(body.notes).slice(0, 1000) : null,
      inspectedById: user.id,
      inspectedAt: new Date(),
    },
    select: { id: true, inspectionStatus: true, inspectedAt: true },
  });

  revalidatePath("/m/quality-control");
  return json({ goodsReceipt: updated, inspectionStatus: updated.inspectionStatus });
});
