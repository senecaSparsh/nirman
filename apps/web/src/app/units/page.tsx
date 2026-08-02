import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { BuiltUnitsView } from "@/components/built-units/built-units-view";
import { PageLoading } from "@/components/page-loading";
import type { BuiltUnitRow, ProjectOption, PhaseOption } from "@/lib/types";

export default function BuiltUnitsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading built units…" variant="cards" />}>
      <BuiltUnitsContent />
    </Suspense>
  );
}

async function BuiltUnitsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.ASSETS_MANAGE),
    canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
  };

  const [builtUnits, projects, phases] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { deletedAt: null, project: { companyId: company.id } },
      orderBy: [{ projectId: "asc" }, { unitNumber: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.projectPhase.findMany({
      where: { project: { companyId: company.id, deletedAt: null } },
      orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, status: true, projectId: true },
    }),
  ]);

  const unitRows: BuiltUnitRow[] = builtUnits.map((u) => ({
    id: u.id,
    projectId: u.projectId,
    projectName: u.project.name,
    phaseId: u.phaseId,
    phaseName: u.phase?.name ?? null,
    unitType: u.unitType,
    unitNumber: u.unitNumber,
    floor: u.floor,
    wing: u.wing,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
    status: u.status,
    productionCost: toNum(u.productionCost),
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    currentValuation: toNum(u.currentValuation),
    nrvWriteDown: toNum(u.nrvWriteDown),
    saleId: u.saleId,
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const phaseRows: PhaseOption[] = phases.map((p) => ({
    id: p.id, projectId: p.projectId, name: p.name, status: p.status,
  }));

  return (
    <BuiltUnitsView
      units={unitRows}
      projects={projectRows}
      phases={phaseRows}
      permissions={perms}
    />
  );
}
