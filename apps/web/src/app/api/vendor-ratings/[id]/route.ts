import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { computeVendorRating } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  // computeVendorRating takes a bare supplierId — verify the supplier belongs
  // to this company before returning their PO/receipt/quote performance.
  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) return json({ error: "Supplier not found" }, { status: 404 });
  const rating = await computeVendorRating(id);
  return json({
    ...rating,
    onTimeRate: rating.onTimeRate.toNumber(),
    qualityRate: rating.qualityRate.toNumber(),
    priceCompetitiveness: rating.priceCompetitiveness.toNumber(),
    overallScore: rating.overallScore.toNumber(),
  });
});
