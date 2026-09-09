import { prisma } from "@nirman/db";
import { getCompany, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewSupplierClient } from "./MobileNewSupplierClient";

export default function MobileNewSupplierPage() {
  return (
    <MobileNewEntityPage perm={PERM.PROCUREMENT_MANAGE} what="add suppliers" permission="procurement.manage" fields={5} soft>
      {async ({ canManage }) => {
        const company = await getCompany();
        const actions = await getActionPermissions();

        // Existing supplier names + phones for duplicate-check
        const existing = await prisma.supplier.findMany({
          where: { companyId: company.id, deletedAt: null },
          select: { name: true, phone: true },
        });

        return (
          <MobileNewSupplierClient
            canCreate={actions?.canCreateSupplier ?? canManage}
            existingNames={existing.map((s) => s.name)}
            existingPhones={existing.map((s) => s.phone).filter(Boolean) as string[]}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
