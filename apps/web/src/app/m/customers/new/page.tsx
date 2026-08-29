import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { MobileCustomerForm } from "@/components/mobile/mobile-customer-form";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/customers/new — mobile customer creation. Minimal fields for
 * fast on-the-spot creation during a sale. Supports ?redirect= for
 * "Save & continue" flow back to the sale form.
 */
export default function MobileNewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonForm fields={3} />}>
      <MobileNewCustomerContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileNewCustomerContent({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const { redirect } = await searchParams;

  if (!hasPermission(role, PERM.SALES_MANAGE)) {
    return <MobileNoAccess what="create customers" permission="sales.manage" />;
  }

  const company = await getCompany();

  // Fetch existing phone numbers for duplicate-check
  const customers = await prisma.customer.findMany({
    where: { companyId: company.id, deletedAt: null, phone: { not: null } },
    select: { phone: true },
  });
  const existingPhones = customers
    .map((c) => c.phone)
    .filter((p): p is string => p !== null);

  return (
    <MobileCustomerForm
      redirectTo={redirect}
      existingPhones={existingPhones}
    />
  );
}
