import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { MobileNewRequisitionClient } from "./MobileNewRequisitionClient";

export default function MobileNewRequisitionPage() {
  return (
    <Suspense fallback={<MobileSkeletonForm fields={4} />}>
      <MobileNewRequisitionContent />
    </Suspense>
  );
}

async function MobileNewRequisitionContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.PROCUREMENT_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <MobileBackButton fallback="/m/requisitions" />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Material Indent
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to create material indents.
        </p>
      </div>
    );
  }

  const company = await getCompany();

  const [projects, materials, suppliers] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = {
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      unit: m.unit,
    })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
  };

  return <MobileNewRequisitionClient data={serialized} />;
}
