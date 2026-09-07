import { prisma } from "@nirman/db";
import { getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileCustomerForm } from "@/components/mobile/mobile-customer-form";

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
    <MobileNewEntityPage perm={PERM.SALES_MANAGE} what="create customers" permission="sales.manage" fields={3}>
      {async () => {
        const { redirect } = await searchParams;
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
      }}
    </MobileNewEntityPage>
  );
}
