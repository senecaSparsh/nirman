import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Building2, Home } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileProjectsList } from "./MobileProjectsList";

/**
 * /m/projects — mobile project list. Replaces every desktop `/projects`
 * link from the mobile surface.
 */
export default function MobileProjectsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileProjectsContent />
    </Suspense>
  );
}

async function MobileProjectsContent() {
  await connection();
  const company = await getCompany();

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      type: true,
      totalBudget: true,
      totalProjectCost: true,
      costPerSqft: true,
      _count: { select: { builtUnits: { where: { deletedAt: null } } } },
    },
  });

  const active = projects.filter(
    (p) => p.status === "PLANNED" || p.status === "ACTIVE",
  );
  const done = projects.filter((p) => p.status === "COMPLETED");
  const hold = projects.filter((p) => p.status === "ON_HOLD");

  // Serialize for the client component (search + filter chips + badges)
  const serialized = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    type: p.type,
    totalBudget: p.totalBudget ? toNum(p.totalBudget) : null,
    unitCount: p._count.builtUnits,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Projects"
        subtitle={`${projects.length} total · ${active.length} active`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Active" value={formatNumber(active.length, 0)} icon={Building2} />
        <MobileStatCard label="Units" value={formatNumber(projects.reduce((s, p) => s + p._count.builtUnits, 0), 0)} icon={Home} />
        <MobileStatCard label="Completed" value={formatNumber(done.length, 0)} icon={Building2} />
        <MobileStatCard label="On Hold" value={formatNumber(hold.length, 0)} icon={Building2} />
      </div>

      <MobileProjectsList items={serialized} />

      {projects.length === 0 && (
        <>
          <MobileSectionTitle>Active &amp; Planned</MobileSectionTitle>
          <MobileEmptyState
            icon={Building2}
            title="No projects yet"
            hint="Create projects from the desktop Setup"
          />
        </>
      )}
    </div>
  );
}
