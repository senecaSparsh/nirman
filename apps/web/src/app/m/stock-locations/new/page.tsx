import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import MobileNewStockLocationClient from "./MobileNewStockLocationClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/stock-locations/new — create a new stock location (warehouse or site).
 * Gates on INVENTORY_MANAGE permission.
 */
export default async function NewStockLocationPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return <MobileNoAccess what="add stock locations" permission="inventory.manage" />;
  }

  await connection();
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <MobileNewStockLocationClient projects={projects} />
    </Suspense>
  );
}
