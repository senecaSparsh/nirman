import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import type { DepartmentRow } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { DepartmentsView } from "@/components/departments/departments-view";

export async function DepartmentsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.INVENTORY_VIEW)) {
    return <NoAccess what="departments" permission={PERM.INVENTORY_VIEW} />;
  }

  const { rows: departments, capped } = applyCap(await prisma.department.findMany({
    take: LIST_CAP + 1,
    where: { companyId: company.id, deletedAt: null },
    orderBy: { code: "asc" },
    include: {
      stockLocation: { select: { id: true, name: true } },
      _count: { select: { materialIssues: { where: { department: { deletedAt: null } } } } },
    },
  }));
  const cappedLabels = capped ? ["departments"] : [];

  // Header stats come from complete aggregates — departments list is capped.
  const [deptTotal, deptActive, deptWithStock] = await Promise.all([
    prisma.department.count({ where: { companyId: company.id, deletedAt: null } }),
    prisma.department.count({ where: { companyId: company.id, deletedAt: null, active: true } }),
    prisma.department.count({ where: { companyId: company.id, deletedAt: null, stockLocation: { isNot: null } } }),
  ]);

  const rows: DepartmentRow[] = departments.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    description: d.description,
    active: d.active,
    stockLocationId: d.stockLocation?.id ?? null,
    stockLocationName: d.stockLocation?.name ?? null,
    issueCount: d._count.materialIssues,
  }));

  const perms = {
    canCreate: __effPerms.includes(PERM.INVENTORY_MANAGE),
    canEdit: __effPerms.includes(PERM.INVENTORY_MANAGE),
    canDelete: __effPerms.includes(PERM.INVENTORY_MANAGE),
  };

  return (
    <>
      <PageHeader
        title="Departments"
        description="Operational cost centers — manufacturing lines, workshop, lab. Materials issued to a department hit Operating Expenses (not WIP)."
        stats={[
          { label: "Departments", value: deptTotal },
          { label: "Active", value: deptActive },
          { label: "With Stock Room", value: deptWithStock },
        ]}
      />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <DepartmentsView
        departments={rows}
        canCreate={perms.canCreate}
        canEdit={perms.canEdit}
        canDelete={perms.canDelete}
      />
    </>
  );
}
