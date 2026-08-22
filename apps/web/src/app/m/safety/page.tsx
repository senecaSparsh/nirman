import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileSafetyContent } from "./MobileSafetyContent";

/**
 * /m/safety — mobile Safety Management.
 * Tabbed view: Incidents | Hazards | Inspections
 */
export default function MobileSafetyPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSafetyPageContent />
    </Suspense>
  );
}

async function MobileSafetyPageContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const [incidents, hazards, inspections, projects] = await Promise.all([
    prisma.safetyIncident.findMany({
      where: { companyId: company.id },
      orderBy: { incidentDate: "desc" },
      take: 50,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.safetyHazard.findMany({
      where: { companyId: company.id },
      orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.safetyInspection.findMany({
      where: { companyId: company.id },
      orderBy: { scheduledDate: "desc" },
      take: 50,
      include: { project: { select: { id: true, name: true } } },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const serializedIncidents = incidents.map((i) => ({
    id: i.id,
    incidentNumber: i.incidentNumber,
    title: i.title,
    type: i.type,
    severity: i.severity,
    status: i.status,
    projectName: i.project.name,
    location: i.location,
    injuredCount: i.injuredCount,
    fatalities: i.fatalities,
    incidentDate: i.incidentDate.toISOString(),
  }));

  const serializedHazards = hazards.map((h) => ({
    id: h.id,
    hazardNumber: h.hazardNumber,
    title: h.title,
    status: h.status,
    riskLevel: h.riskLevel,
    likelihood: h.likelihood,
    severity: h.severity,
    projectName: h.project.name,
    location: h.location,
    targetResolutionDate: h.targetResolutionDate?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
  }));

  const serializedInspections = inspections.map((i) => ({
    id: i.id,
    inspectionNumber: i.inspectionNumber,
    title: i.title,
    status: i.status,
    result: i.result,
    projectName: i.project.name,
    scheduledDate: i.scheduledDate.toISOString(),
    conductedDate: i.conductedDate?.toISOString() ?? null,
    inspectorName: i.inspectorName,
  }));

  return (
    <MobileSafetyContent
      incidents={serializedIncidents}
      hazards={serializedHazards}
      inspections={serializedInspections}
      projects={projects}
      canManage={canManage}
    />
  );
}
