import { prisma } from "@nirman/db";
import { getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewPettyCashClient } from "./MobileNewPettyCashClient";

/**
 * /m/petty-cash/new — standalone mobile form to create a petty
 * cash float. Fetches projects and employees for the current
 * company, then renders a client form that POSTs to /api/petty-cash.
 */
export default function MobileNewPettyCashPage() {
  return (
    <MobileNewEntityPage perm={PERM.FINANCE_MANAGE} what="create petty cash floats" permission="finance.manage" fields={4}>
      {async () => {
        const company = await getCompany();

        const [projects, employees] = await Promise.all([
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.user.findMany({
            where: { memberships: { some: { companyId: company.id } } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
        ]);

        return (
          <MobileNewPettyCashClient
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
