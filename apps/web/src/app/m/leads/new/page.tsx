import { prisma } from "@nirman/db";
import { getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewLeadClient } from "./MobileNewLeadClient";

/**
 * /m/leads/new — mobile new-lead form. The /m/leads list page has a FAB
 * that links here. Fetches projects, available units, and sales-team
 * members for the dropdowns, then renders the client form.
 */
export default function MobileNewLeadPage() {
  return (
    <MobileNewEntityPage perm={PERM.SALE_CREATE} what="create leads" permission="sale.create" fields={6}>
      {async () => {
        const company = await getCompany();

        const [projects, units, assignees] = await Promise.all([
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.builtUnit.findMany({
            where: {
              deletedAt: null,
              status: { in: ["AVAILABLE", "HOLD"] },
              project: { companyId: company.id, deletedAt: null },
            },
            orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
            select: { id: true, unitNumber: true, unitType: true, projectId: true, project: { select: { name: true } } },
          }),
          prisma.userCompany.findMany({
            where: {
              companyId: company.id,
              role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "SALES_MANAGER"] },
              user: { active: true },
            },
            orderBy: { user: { name: "asc" } },
            select: { user: { select: { id: true, name: true } } },
          }),
        ]);

        return (
          <MobileNewLeadClient
            projects={projects}
            units={units.map((u) => ({
              id: u.id,
              projectId: u.projectId,
              projectName: u.project.name,
              label: `${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`,
            }))}
            assignees={assignees.map((a) => ({ id: a.user.id, name: a.user.name }))}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
