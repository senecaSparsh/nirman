import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany, getUserRole } from "@/lib/server";
import { ROLES, normalizeRole } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { MeSettingsView } from "@/components/me/me-settings-view";
import type { MembershipData } from "@/components/profile/profile-tabs";

export default function MePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your Settings"
        description="Edit your profile, change your password, and switch companies."
      />
      <Suspense fallback={<PageLoading label="Loading your settings…" />}>
        <MeContent />
      </Suspense>
    </div>
  );
}

async function MeContent() {
  await connection();
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return <p className="text-body text-muted-foreground">Not signed in.</p>;
  }

  const role = normalizeRole(await getUserRole());
  const company = await getCompany();
  const roleDef = ROLES[role];

  // Fetch full user record
  const dbUser = currentUser.id === "dev"
    ? { id: "dev", name: currentUser.name, email: currentUser.email, phone: null, image: null }
    : await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { id: true, name: true, email: true, phone: true, image: true },
      });

  if (!dbUser) {
    return <p className="text-body text-muted-foreground">User not found.</p>;
  }

  // Fetch memberships for company switcher
  const memberships: MembershipData[] = currentUser.id === "dev"
    ? [{ id: "dev", company: { id: company.id, name: company.name, businessType: null }, role, isCurrent: true }]
    : await prisma.userCompany.findMany({
        where: { userId: currentUser.id },
        include: { company: { select: { id: true, name: true, businessType: true } } },
        orderBy: { createdAt: "asc" },
      }).then((rows) => rows.map((m) => ({
        id: m.id,
        company: { id: m.company.id, name: m.company.name, businessType: m.company.businessType },
        role: m.role,
        isCurrent: m.company.id === company.id,
      })));

  return (
    <MeSettingsView
      user={{
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        image: dbUser.image,
      }}
      roleLabel={roleDef.label}
      roleDescription={roleDef.description}
      memberships={memberships}
    />
  );
}
