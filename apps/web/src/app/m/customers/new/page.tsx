import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { Users } from "lucide-react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { MobileCustomerForm } from "@/components/mobile/mobile-customer-form";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";

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
    return (
      <div className="pb-32">
        <div className="flex items-center gap-2 mb-3">
          <MobileBackButton fallback="/m/customers" style={{ color: "var(--color-ink-700)" }} />
          <p className="text-[0.875rem] font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
            New Customer
          </p>
        </div>
        <div className="flex flex-col items-center text-center px-4 py-7">
          <div className="grid place-items-center size-11 rounded-full mb-2.5" style={{ backgroundColor: "var(--color-concrete)" }}>
            <Users className="size-5" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>No access</p>
          <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
            You don&apos;t have permission to create customers.
          </p>
        </div>
      </div>
    );
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
