import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import MobileNewMaterialClient from "./MobileNewMaterialClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/materials/new — create a new material from mobile.
 * Gates on INVENTORY_MANAGE permission.
 */
export default async function NewMaterialPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return <MobileNoAccess what="add materials" permission="inventory.manage" />;
  }

  // Fetch categories for the dropdown
  await connection();
  const categories = await prisma.materialCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });

  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <MobileNewMaterialClient categories={categories} />
    </Suspense>
  );
}
