import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import MobileNewMaterialClient from "./MobileNewMaterialClient";

/**
 * /m/materials/new — create a new material from mobile.
 * Gates on INVENTORY_MANAGE permission.
 */
export default async function NewMaterialPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Material
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to add materials. Only managers and admins can create new materials.
        </p>
      </div>
    );
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
