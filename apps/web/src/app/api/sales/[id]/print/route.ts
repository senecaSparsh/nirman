import { NextRequest } from "next/server";
import { getPrintableSaleData } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sales/[id]/print — full data for the printable sales form.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_VIEW);
  const { id } = await params;
  try {
    const data = await getPrintableSaleData(id);
    return json(data);
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Sale not found") }, { status: 404 });
  }
});
