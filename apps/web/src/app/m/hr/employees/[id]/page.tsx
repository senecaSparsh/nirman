import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileEmployeeDetailClient } from "./MobileEmployeeDetailClient";

export default function MobileEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileEmployeeDetailContent params={params} />
    </Suspense>
  );
}

async function MobileEmployeeDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.HR_MANAGE);
  const { id } = await params;

  const [employee, projects, stockLocations] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null },
      include: {
        crew: { select: { id: true, name: true } },
        activeProject: { select: { id: true, name: true } },
        attendances: { orderBy: { date: "desc" }, take: 10 },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!employee) {
    return (
      <>
        <MobileEmployeeDetailClient notFound canManage={canManage} projects={projects} stockLocations={stockLocations} />
      </>
    );
  }

  const data = {
    id: employee.id,
    name: employee.name,
    trade: employee.trade,
    designation: employee.designation,
    phone: employee.phone,
    email: employee.email,
    wageType: employee.wageType as "DAILY" | "MONTHLY" | "FIXED",
    dailyRate: employee.dailyRate != null ? toNum(employee.dailyRate) : null,
    monthlySalary: employee.monthlySalary != null ? toNum(employee.monthlySalary) : null,
    joinDate: employee.joinDate ? employee.joinDate.toISOString() : null,
    hierarchyLevel: employee.hierarchyLevel,
    crewName: employee.crew?.name ?? null,
    activeProjectName: employee.activeProject?.name ?? null,
    attendances: employee.attendances.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
    })),
  };

  return (
    <>
      <MobileEmployeeDetailClient
        employee={data}
        canManage={canManage}
        projects={projects}
        stockLocations={stockLocations}
      />
    </>
  );
}
