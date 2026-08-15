import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import MobileNewStockLocationClient from "./MobileNewStockLocationClient";

/**
 * /m/stock-locations/new — create a new stock location (warehouse or site).
 * Gates on INVENTORY_MANAGE permission.
 */
export default async function NewStockLocationPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <MobileBackButton fallback="/m/stock" />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Stock Location
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to add stock locations.
        </p>
      </div>
    );
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
