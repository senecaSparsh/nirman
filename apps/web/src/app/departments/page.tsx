import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { DepartmentsView, type DepartmentRow } from "@/components/departments/departments-view";

export const dynamic = "force-dynamic";

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading departments…" variant="list" />}>
      <DepartmentsContent />
    </Suspense>
  );
}

async function DepartmentsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="departments" />;
  }

  const departments = await prisma.department.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { code: "asc" },
    include: {
      stockLocation: { select: { id: true, name: true } },
      _count: { select: { materialIssues: { where: { department: { deletedAt: null } } } } },
    },
  });

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
    canCreate: hasPermission(role, PERM.INVENTORY_MANAGE),
    canEdit: hasPermission(role, PERM.INVENTORY_MANAGE),
    canDelete: hasPermission(role, PERM.INVENTORY_MANAGE),
  };

  return (
    <>
      <PageHeader
        title="Departments"
        description="Operational cost centers — manufacturing lines, workshop, lab. Materials issued to a department hit Operating Expenses (not WIP)."
        stats={[
          { label: "Departments", value: rows.length },
          { label: "Active", value: rows.filter((d) => d.active).length },
          { label: "With Stock Room", value: rows.filter((d) => d.stockLocationName).length },
        ]}
      />
      <DepartmentsView
        departments={rows}
        canCreate={perms.canCreate}
        canEdit={perms.canEdit}
        canDelete={perms.canDelete}
      />
    </>
  );
}
