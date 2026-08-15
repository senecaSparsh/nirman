import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNewSupplierClient } from "./MobileNewSupplierClient";

export default function MobileNewSupplierPage() {
  return (
    <Suspense fallback={<MobileSkeletonForm fields={5} />}>
      <MobileNewSupplierContent />
    </Suspense>
  );
}

async function MobileNewSupplierContent() {
  await connection();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();

  // Existing supplier names + phones for duplicate-check
  const existing = await prisma.supplier.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { name: true, phone: true },
  });

  return (
    <MobileNewSupplierClient
      canCreate={canCreate}
      existingNames={existing.map((s) => s.name)}
      existingPhones={existing.map((s) => s.phone).filter(Boolean) as string[]}
    />
  );
}
