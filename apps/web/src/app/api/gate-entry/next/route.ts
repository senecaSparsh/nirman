import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/gate-entry/next?locationId=xxx
 * Returns the next sequential unloading slip number for a location.
 * Unloading Slip: US-YYYY-NNN (issued by storekeeper after goods are unloaded)
 * Resets per year per location.
 *
 * Note: Gate pass no. is NOT auto-generated — it comes from the supplier's
 * document. For small deliveries with no gate pass, a receiving photo is
 * uploaded instead.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const locationId = req.nextUrl.searchParams.get("locationId");

  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Count existing GRNs with unloading slip numbers at this location this year
  const unloadingCount = await prisma.goodsReceipt.count({
    where: {
      locationId: locationId ?? undefined,
      receiptDate: { gte: yearStart, lt: yearEnd },
      unloadingSlipNo: { startsWith: `US-${year}` },
    },
  });

  const unloadingSeq = String(unloadingCount + 1).padStart(3, "0");

  return json({
    unloadingSlipNo: `US-${year}-${unloadingSeq}`,
  });
});
