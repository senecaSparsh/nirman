import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { MobileNewLeadClient } from "./MobileNewLeadClient";

/**
 * /m/leads/new — mobile new-lead form. The /m/leads list page has a FAB
 * that links here. Fetches projects, available units, and sales-team
 * members for the dropdowns, then renders the client form.
 */
export default async function MobileNewLeadPage() {
  return (
    <Suspense fallback={<MobileSkeletonForm fields={6} />}>
      <MobileNewLeadContent />
    </Suspense>
  );
}

async function MobileNewLeadContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.SALE_CREATE)) {
    return <MobileNoAccess what="create leads" permission="sale.create" />;
  }

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
}
