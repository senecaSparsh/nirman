import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNewRequisitionClient } from "./MobileNewRequisitionClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

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
    return <MobileNoAccess what="create material indents" permission="procurement.manage" />;
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
