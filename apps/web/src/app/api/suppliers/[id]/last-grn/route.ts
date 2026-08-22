import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompanyGroupIds, json, requireUser } from "@/lib/server";

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
  const { id } = await params;

  // Find the most recent GRN for any PO from this supplier
  const lastGrn = await prisma.goodsReceipt.findFirst({
    where: {
      purchaseOrder: { supplierId: id },
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
