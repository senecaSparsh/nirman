import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { notFound } from "next/navigation";
import { MobileNewPortalListingClient } from "./MobileNewPortalListingClient";

/**
 * /m/portal-listings/new — mobile form for creating a new portal listing.
 * Fetches available built units and renders the client form.
 */
export default function MobileNewPortalListingPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={4} />}>
      <MobileNewPortalListingContent />
    </Suspense>
  );
}

async function MobileNewPortalListingContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.SALES_MANAGE)) notFound();

  const units = await prisma.builtUnit.findMany({
    where: {
      project: { companyId: company.id },
      deletedAt: null,
      status: "AVAILABLE",
    },
    orderBy: { unitNumber: "asc" },
    select: {
      id: true,
      unitNumber: true,
      unitType: true,
      area: true,
      areaUnit: true,
      askingPrice: true,
      project: { select: { name: true } },
    },
  });

  const serialized = units.map((u) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    unitType: u.unitType,
    projectName: u.project.name,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
  }));

  return <MobileNewPortalListingClient units={serialized} />;
}
