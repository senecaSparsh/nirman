import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany } from "@/lib/server";
import { MePageClient, type MePageInitial } from "./MePageClient";

/**
 * /m/me — profile, settings, and rehomed header features.
 *
 * Server Component wrapper. Resolves the user's extended profile fields
 * + active company name on the server so the client child renders with
 * real data on first paint — no /api/me + /api/company waterfall, no
 * skeleton-then-swap flash. Falls back to `null` when unauthenticated
 * (the client auth guard handles the redirect).
 */
export default async function MePage() {
  const initial = await resolveMePageInitial().catch(() => null);
  return <MePageClient initial={initial} />;
}

async function resolveMePageInitial(): Promise<MePageInitial | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const company = await getCompany();

  // Fetch the extended profile fields that /api/me also returns —
  // phone, image, employeeCode, etc. are not on the session object.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      phone: true,
      image: true,
      active: true,
      employeeCode: true,
      designation: true,
      department: true,
      joiningDate: true,
      lastLoginAt: true,
    },
  });

  return {
    name: user.name,
    role: user.role,
    email: user.email,
    phone: dbUser?.phone ?? null,
    image: dbUser?.image ?? null,
    active: dbUser?.active ?? true,
    employeeCode: dbUser?.employeeCode ?? null,
    designation: dbUser?.designation ?? null,
    department: dbUser?.department ?? null,
    joiningDate: dbUser?.joiningDate?.toISOString() ?? null,
    lastLoginAt: dbUser?.lastLoginAt?.toISOString() ?? null,
    companyName: company.name,
  };
}
