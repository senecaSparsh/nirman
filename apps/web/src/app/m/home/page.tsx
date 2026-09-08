import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser } from "@/lib/server";
import { PERM, hasPermission, roleTier } from "@/lib/roles";
import { getUserRole } from "@/lib/server";
import { roleToPersona, type Persona } from "@/lib/mobile-nav-v2";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { type CompanyCardData } from "./home-client";
import { AdaptiveHomeContent, type HomeData } from "./adaptive-home";
import { getDeviceTierFromCookies, estimateDeviceTierFromUA } from "@/lib/device-tier";

/**
 * /m/home — Orbit navigation hub.
 *
 * Adaptive: on high-tier devices (modern phone, fast network), the server
 * skips the heavy Prisma queries and sends a lightweight shell. The client
 * fetches data from /api/mobile/home instead — saving ~30MB of server RAM
 * per concurrent request. On low-tier devices (old phone, 2G), the server
 * fetches data and renders full HTML — saving the user's battery and
 * working on slow networks.
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

  // ── Detect device tier from cookie (set by client on first visit) ──
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie");
  const userAgent = headerList.get("user-agent");
  const tier = getDeviceTierFromCookies(cookieHeader) ?? estimateDeviceTierFromUA(userAgent);

  // High-tier devices: skip SSR data fetching, let the client fetch
  if (tier === "high") {
    return (
      <AdaptiveHomeContent
        serverData={null}
        apiUrl="/api/mobile/home"
      />
    );
  }

  // Low/mid-tier devices: full SSR (current behavior)
  const [company, user, role] = await Promise.all([
    getCompany(),
    getCurrentUser(),
    getUserRole(),
  ]);

  const canCreateCompany =
    hasPermission(role, PERM.COMPANY_MANAGE) && !company.parentCompanyId;
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";
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

  // ── Self-check-in widget: only for field/execution staff (tier 4+) ──
  // Executives (OWNER, ADMIN, DEVELOPER) and senior management don't need
  // GPS attendance tracking — they're office-based. The SRG provisioning
  // script creates Employee records for all staff (including the Owner)
  // for HR purposes, but that doesn't mean the Owner should check in.
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const isFieldStaff = roleTier(role) >= 4;
  const myEmployee = user && isFieldStaff
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

  const homeData: HomeData = {
    currentCompany: {
      id: company.id,
      name: company.name,
      businessType: company.businessType,
      currency: company.currency,
    },
    companies,
    canCreateCompany,
    userName: user?.name ?? null,
    role,
    persona: roleToPersona(role) as Persona,
    myEmployee: myEmployee ? { id: myEmployee.id, name: myEmployee.name } : null,
    myAttendance: myAttendance
      ? {
          checkIn: myAttendance.checkIn?.toISOString() ?? null,
          checkOut: myAttendance.checkOut?.toISOString() ?? null,
          hoursWorked: myAttendance.hoursWorked ? Number(myAttendance.hoursWorked) : null,
        }
      : null,
  };

  return (
    <AdaptiveHomeContent
      serverData={homeData}
      apiUrl="/api/mobile/home"
    />
  );
}
