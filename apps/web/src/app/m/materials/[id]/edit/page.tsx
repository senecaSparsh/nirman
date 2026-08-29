import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import MobileNewMaterialClient from "../../new/MobileNewMaterialClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/materials/[id]/edit — edit an existing material from mobile.
 * Gates on INVENTORY_MANAGE permission.
 */
export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return <MobileNoAccess what="edit materials" permission="inventory.manage" />;
  }

  await connection();
  const { id } = await params;

  const [material, categories] = await Promise.all([
    prisma.material.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, code: true, name: true, grade: true, specification: true,
        categoryId: true, unit: true, hsnCode: true, gstRate: true,
        standardCost: true, reorderPoint: true, description: true,
      },
    }),
    prisma.materialCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  if (!material) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
          Material not found
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <MobileNewMaterialClient
        categories={categories}
        material={{
          ...material,
          grade: material.grade ?? "",
          specification: material.specification ?? "",
          hsnCode: material.hsnCode ?? "",
          description: material.description ?? "",
          standardCost: Number(material.standardCost),
          gstRate: Number(material.gstRate),
          reorderPoint: material.reorderPoint ? Number(material.reorderPoint) : null,
        }}
      />
    </Suspense>
  );
}
