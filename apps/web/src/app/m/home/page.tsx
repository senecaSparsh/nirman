import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser } from "@/lib/server";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { MobileHomeClient, type CompanyCardData } from "./home-client";

/**
 * /m/home — Orbit navigation hub.
 *
 * Shows the user's companies as a 3-col grid of cards. Tapping a company
 * opens the OrbitNavigator popup, which lets the user drill down through
 * the hierarchy: Company → Projects → Built Units → Sales → Payments.
 *
 * This is the "Home" tab — a bird's-eye view of everything the user owns.
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
  // Parallelize company + user fetches (each calls getSession internally,
  // but the DB queries after session resolution run concurrently).
  const [company, user] = await Promise.all([getCompany(), getCurrentUser()]);

  // Fetch all companies the user has membership in
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
    // Dev bypass — show all companies
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
    memberships = allCompanies.map((c) => ({
      role: "OWNER",
      company: c,
    }));
  }

  // If no memberships, show the current company at least
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

  return <MobileHomeClient companies={companies} />;
}
