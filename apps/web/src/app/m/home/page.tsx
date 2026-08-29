import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { getUserRole } from "@/lib/server";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { MobileSelfCheckIn } from "@/components/mobile/mobile-self-check-in";
import { MorningBriefing } from "@/components/mobile/morning-briefing";
import { MobileHomeClient, type CompanyCardData } from "./home-client";

/**
 * /m/home — Orbit navigation hub.
 *
 * Shows the orbit for the currently selected company directly (no grid).
 * A horizontal company switcher strip at the top lets the user pick which
 * company's orbit to explore. Switching via the header/settings company
 * switcher also updates the orbit via the "nirman-company-switched" event.
 */
export default function MobileHomePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  await connection();
  const [company, user, role] = await Promise.all([
    getCompany(),
    getCurrentUser(),
    getUserRole(),
  ]);

  // Only OWNER/ADMIN at the top of the hierarchy can create new companies.
  // A child company user shouldn't be creating siblings — only the parent
  // owner can spawn new subsidiaries.
  const canCreateCompany =
    hasPermission(role, PERM.COMPANY_MANAGE) && !company.parentCompanyId;
  const isDevBypass = process.env.AUTH_BYPASS === "true";
  let memberships;

  if (user && !isDevBypass) {
    memberships = await prisma.userCompany.findMany({
      where: { userId: user.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            businessType: true,
            currency: true,
            deletedAt: true,
            _count: {
              select: {
                projects: { where: { deletedAt: null } },
                landPurchases: true,
                employees: { where: { active: true } },
              },
            },
          },
        },
      },
    });
    memberships = memberships.filter((m) => m.company.deletedAt === null);
  } else {
    const allCompanies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        businessType: true,
        currency: true,
        _count: {
          select: {
            projects: { where: { deletedAt: null } },
            landPurchases: true,
            employees: { where: { active: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    memberships = allCompanies.map((c) => ({ role: "OWNER", company: c }));
  }

  if (memberships.length === 0) {
    const c = await prisma.company.findFirst({
      where: { id: company.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        businessType: true,
        currency: true,
        _count: {
          select: {
            projects: { where: { deletedAt: null } },
            landPurchases: true,
            employees: { where: { active: true } },
          },
        },
      },
    });
    if (c) {
      memberships = [{ role: "OWNER", company: c }];
    }
  }

  const companies: CompanyCardData[] = memberships.map((m: { company: { id: string; name: string; businessType: string | null; currency: string; _count: { projects: number; landPurchases: number; employees: number } } }) => ({
    id: m.company.id,
    name: m.company.name,
    businessType: m.company.businessType,
    currency: m.company.currency,
    projectCount: m.company._count.projects,
    landCount: m.company._count.landPurchases,
    employeeCount: m.company._count.employees,
  }));

  // ── Self-check-in widget: fetch the user's employee record + today's attendance ──
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const myEmployee = user
    ? await prisma.employee.findFirst({
        where: { userId: user.id, companyId: company.id, deletedAt: null, active: true },
        select: { id: true, name: true },
      })
    : null;

  const myAttendance = myEmployee
    ? await prisma.workerAttendance.findFirst({
        where: {
          employeeId: myEmployee.id,
          date: { gte: startOfToday, lt: endOfToday },
        },
        select: { checkIn: true, checkOut: true, hoursWorked: true, status: true },
      })
    : null;

  return (
    <>
      {/* ── Morning briefing — glanceable summary of what needs attention today ── */}
      <MorningBriefing />

      {/* ── Self-check-in widget (only for employees with an employee record) ── */}
      {myEmployee && (
        <div className="mb-3">
          <MobileSelfCheckIn
            employeeId={myEmployee.id}
            employeeName={myEmployee.name}
            hasCheckedIn={!!myAttendance?.checkIn}
            checkInTime={myAttendance?.checkIn?.toTimeString().slice(0, 5) ?? null}
            hasCheckedOut={!!myAttendance?.checkOut}
            checkOutTime={myAttendance?.checkOut?.toTimeString().slice(0, 5) ?? null}
            hoursWorked={myAttendance?.hoursWorked ? Number(myAttendance.hoursWorked) : null}
          />
        </div>
      )}

      <MobileHomeClient
        currentCompany={{
          id: company.id,
          name: company.name,
          businessType: company.businessType,
          currency: company.currency,
        }}
        companies={companies}
        canCreateCompany={canCreateCompany}
      />
    </>
  );
}
