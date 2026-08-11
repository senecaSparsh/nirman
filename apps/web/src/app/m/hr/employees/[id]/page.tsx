import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { User, Phone, Mail, Briefcase, IndianRupee, Calendar, Clock } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
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
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      crew: { select: { id: true, name: true } },
      activeProject: { select: { id: true, name: true } },
      attendances: { orderBy: { date: "desc" }, take: 10 },
    },
  });

  if (!employee) {
    return (
      <div>
        <MobileDetailHeader title="Employee" backHref="/m/hr/employees" />
        <MobileEmptyState icon={User} title="Employee not found" />
      </div>
    );
  }

  const canManage = hasPermission(role, PERM.HR_MANAGE);
  const presentDays = employee.attendances.filter((a) => a.status === "PRESENT").length;
  const totalDays = employee.attendances.length;

  return (
    <div>
      <MobileDetailHeader
        title={employee.name}
        subtitle={employee.designation ?? employee.trade ?? "no designation"}
        backHref="/m/hr/employees"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Contact</MobileSectionTitle>
      <div>
        {employee.phone && <MobileInfoRow icon={Phone} title="Phone" value={employee.phone} />}
        {employee.email && <MobileInfoRow icon={Mail} title="Email" value={employee.email} />}
        {employee.trade && <MobileInfoRow icon={Briefcase} title="Trade" value={employee.trade} />}
        {employee.crew && (
          <MobileInfoRow icon={Briefcase} title="Crew" value={employee.crew.name} />
        )}
        {employee.activeProject && (
          <MobileInfoRow icon={Briefcase} title="Project" value={employee.activeProject.name} />
        )}
        {employee.joinDate && (
          <MobileInfoRow icon={Calendar} title="Join Date" value={formatDate(employee.joinDate)} />
        )}
      </div>

      <MobileSectionTitle>Salary</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label={employee.wageType === "DAILY" ? "Daily Rate" : "Monthly Salary"}
          value={formatCurrency(toNum(employee.wageType === "DAILY" ? employee.dailyRate : employee.monthlySalary))}
          icon={IndianRupee}
          tone="brand"
        />
        <MobileStatCard
          label="Attendance"
          value={`${presentDays}/${totalDays}`}
          icon={Clock}
        />
      </div>

      {employee.attendances.length > 0 && (
        <>
          <MobileSectionTitle>Recent Attendance</MobileSectionTitle>
          <div>
            {employee.attendances.map((a) => (
              <MobileRow
                key={a.id}
                icon={Calendar}
                title={formatDate(a.date)}
                subtitle={a.status}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
