import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { SafetyView } from "@/components/safety/safety-view";

export default function SafetyPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading safety…" variant="default" />}>
        <SafetyContent />
      </Suspense>
    </div>
  );
}

async function SafetyContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="safety management" />;
  }

  const [projects, incidents, hazards, inspections] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.safetyIncident.findMany({
      where: { companyId: company.id },
      orderBy: { incidentDate: "desc" },
      take: 100,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.safetyHazard.findMany({
      where: { companyId: company.id },
      orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.safetyInspection.findMany({
      where: { companyId: company.id },
      orderBy: { scheduledDate: "desc" },
      take: 100,
      include: { project: { select: { id: true, name: true } } },
    }),
  ]);

  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const serializedIncidents = incidents.map((i) => ({
    id: i.id, incidentNumber: i.incidentNumber, title: i.title, type: i.type, severity: i.severity, status: i.status,
    projectName: i.project.name, location: i.location, injuredCount: i.injuredCount, fatalities: i.fatalities,
    incidentDate: i.incidentDate.toISOString(),
  }));

  const serializedHazards = hazards.map((h) => ({
    id: h.id, hazardNumber: h.hazardNumber, title: h.title, status: h.status, riskLevel: h.riskLevel,
    likelihood: h.likelihood, severity: h.severity, projectName: h.project.name, location: h.location,
    targetResolutionDate: h.targetResolutionDate?.toISOString() ?? null, createdAt: h.createdAt.toISOString(),
  }));

  const serializedInspections = inspections.map((i) => ({
    id: i.id, inspectionNumber: i.inspectionNumber, title: i.title, status: i.status, result: i.result,
    projectName: i.project.name, scheduledDate: i.scheduledDate.toISOString(),
    conductedDate: i.conductedDate?.toISOString() ?? null, inspectorName: i.inspectorName,
  }));

  return (
    <>
      <PageHeader
        title="Safety Management"
        description="Track incidents, hazards, and safety inspections across all projects. Manage investigations, mitigations, and compliance walkthroughs."
        stats={[
          { label: "Incidents", value: serializedIncidents.length },
          { label: "Open Hazards", value: serializedHazards.filter((h) => h.status !== "RESOLVED").length },
          { label: "Inspections", value: serializedInspections.length },
          { label: "Critical Hazards", value: serializedHazards.filter((h) => h.riskLevel === "CRITICAL" && h.status !== "RESOLVED").length },
        ]}
      />
      <SafetyView
        incidents={serializedIncidents}
        hazards={serializedHazards}
        inspections={serializedInspections}
        projects={projects}
        canManage={canManage}
      />
    </>
  );
}
