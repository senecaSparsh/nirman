import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import MobileNewMaterialClient from "../../new/MobileNewMaterialClient";

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
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          Edit Material
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to edit materials. Only managers and admins can edit materials.
        </p>
      </div>
    );
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
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
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
