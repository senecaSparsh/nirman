import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {apiHandler, getCompany, json, requireUser, scopeWhere} from "@/lib/server";

/**
 * GET /api/suppliers/[id]/last-grn — returns logistics fields from the
 * supplier's most recent goods receipt, so the mobile receive dialog can
 * auto-fill vehicle/driver/transporter info.
 *
 * Used for "faster receiving" automation — same supplier usually sends
 * the same truck/driver, so we pre-fill from the last GRN.
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;

  // Verify the supplier belongs to the user's company (prevents cross-tenant access)
  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) return json({ found: false });

  // Find the most recent GRN for any PO from this supplier
  const lastGrn = await prisma.goodsReceipt.findFirst({
    where: {
      purchaseOrder: { supplierId: id, companyId: company.id },
      ...await scopeWhere("GoodsReceipt"),
      // Only consider GRNs that actually have vehicle info
      vehicleNumber: { not: null },
    },
    orderBy: { receiptDate: "desc" },
    select: {
      vehicleNumber: true,
      vehicleType: true,
      driverName: true,
      driverPhone: true,
      transporterName: true,
    },
  });

  if (!lastGrn) {
    return json({ found: false });
  }

  return json({
    found: true,
    vehicleNumber: lastGrn.vehicleNumber,
    vehicleType: lastGrn.vehicleType,
    driverName: lastGrn.driverName,
    driverPhone: lastGrn.driverPhone,
    transporterName: lastGrn.transporterName,
  });
});
