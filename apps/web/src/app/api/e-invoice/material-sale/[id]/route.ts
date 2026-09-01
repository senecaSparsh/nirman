import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import {
  generateMaterialSaleIrn,
  cancelMaterialSaleIrn,
} from "@nirman/services";

/**
 * POST /api/e-invoice/material-sale/[id] — generate IRN for a material sale
 * DELETE /api/e-invoice/material-sale/[id] — cancel IRN (body: { reason })
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const result = await generateMaterialSaleIrn(id, company.id, user.id);
  return NextResponse.json(result);
});

export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason ?? "Cancelled by user";
  const result = await cancelMaterialSaleIrn(id, company.id, reason, user.id);
  return NextResponse.json(result);
});
