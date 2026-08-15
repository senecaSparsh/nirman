import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { User, Phone, Mail, Briefcase, IndianRupee, Calendar, Clock } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";

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
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={User} title="Employee not found" />
      </div>
    );
  }

  const presentDays = employee.attendances.filter((a) => a.status === "PRESENT").length;
  const totalDays = employee.attendances.length;

  return (
    <div>
      <div className="mb-4">
      </div>

      <MobileSectionTitle>Contact</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        {employee.phone && <MobileRow icon={Phone} title="Phone" meta={employee.phone} />}
        {employee.email && <MobileRow icon={Mail} title="Email" meta={employee.email} />}
        {employee.trade && <MobileRow icon={Briefcase} title="Trade" meta={employee.trade} />}
        {employee.crew && (
          <MobileRow icon={Briefcase} title="Crew" meta={employee.crew.name} />
        )}
        {employee.activeProject && (
          <MobileRow icon={Briefcase} title="Project" meta={employee.activeProject.name} />
        )}
        {employee.joinDate && (
          <MobileRow icon={Calendar} title="Join Date" meta={formatDate(employee.joinDate)} />
        )}
      </div>

      <MobileSectionTitle>Salary</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label={employee.wageType === "DAILY" ? "Daily Rate" : "Monthly Salary"}
          value={formatCurrency(toNum(employee.wageType === "DAILY" ? employee.dailyRate : employee.monthlySalary))}
          icon={IndianRupee}
          tone="signal"
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
          <div className="flex flex-col gap-2.5">
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
