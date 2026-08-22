import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Building2, Home } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { MobileProjectsList } from "./MobileProjectsList";

/**
 * /m/projects — mobile project list. Replaces every desktop `/projects`
 * link from the mobile surface.
 *
 * Reskinned to use v2 warm primitives (site-grade aesthetic).
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
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.PROJECTS_MANAGE);

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
      reraNumber: true,
      _count: { select: { builtUnits: { where: { deletedAt: null } } } },
    },
  });

  const active = projects.filter(
    (p) => p.status === "PLANNED" || p.status === "ACTIVE",
  );
  const done = projects.filter((p) => p.status === "COMPLETED");
  const hold = projects.filter((p) => p.status === "ON_HOLD");

  // ── Build attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  // Projects on hold
  for (const p of hold) {
    attentionBanners.push({
      id: p.id,
      title: p.name,
      subtitle: `On hold · ${p._count.builtUnits} unit${p._count.builtUnits !== 1 ? "s" : ""} affected`,
      href: `/m/projects/${p.id}`,
      severity: "out",
      qtyText: "Hold",
      category: "Project",
    });
  }

  // Active projects over budget
  for (const p of active) {
    const budget = p.totalBudget ? toNum(p.totalBudget) : 0;
    const cost = p.totalProjectCost ? toNum(p.totalProjectCost) : 0;
    if (budget > 0 && cost > budget) {
      const overBy = cost - budget;
      attentionBanners.push({
        id: `budget-${p.id}`,
        title: p.name,
        subtitle: `Over budget by ${formatCurrency(overBy)} · budget ${formatCurrency(budget)}`,
        href: `/m/projects/${p.id}`,
        severity: "low",
        qtyText: formatCurrency(overBy),
        category: "Over Budget",
      });
    }
  }

  // Active projects with zero units
  for (const p of active.filter((p) => p._count.builtUnits === 0)) {
    attentionBanners.push({
      id: `no-units-${p.id}`,
      title: p.name,
      subtitle: `Active project with no built units yet`,
      href: `/m/projects/${p.id}`,
      severity: "low",
      qtyText: "0",
      category: "No Units",
    });
  }

  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `${active.length} active project${active.length !== 1 ? "s" : ""} · ${done.length} completed · all on budget`,
      href: "/m/projects",
      severity: "clear",
      qtyText: "✓",
      category: "Everything looks good",
    });
  }

  // Serialize for the client component (search + filter chips + badges)
  const serialized = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    type: p.type,
    totalBudget: p.totalBudget ? toNum(p.totalBudget) : null,
    reraNumber: p.reraNumber,
    unitCount: p._count.builtUnits,
  }));

  return (
    <div>
      {/* ── Attention banner carousel ── */}
      <AttentionBannerCarousel banners={attentionBanners} />

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Active" value={formatNumber(active.length, 0)} icon={Building2} tone="go" />
        <MobileStatCard label="Units" value={formatNumber(projects.reduce((s, p) => s + p._count.builtUnits, 0), 0)} icon={Home} />
        <MobileStatCard label="Completed" value={formatNumber(done.length, 0)} icon={Building2} tone="signal" />
        <MobileStatCard label="On Hold" value={formatNumber(hold.length, 0)} icon={Building2} tone="stop" />
      </div>

      <MobileExportShareBar
        title="Projects"
        rows={serialized as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "totalBudget", label: "Budget", format: "currency" },
          { key: "unitCount", label: "Units" },
        ] as MobileColumnSpec[]}
        summary={`${projects.length} projects · ${active.length} active`}
      />

      <MobileProjectsList items={serialized} canManage={canManage} />
    </div>
  );
}
