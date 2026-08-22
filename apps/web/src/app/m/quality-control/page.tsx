import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { ClipboardCheck, Plus } from "lucide-react";
import { MobileNcrList } from "./MobileNcrList";
import { MobileNcrFab } from "./MobileNcrFab";

/**
 * /m/quality-control — mobile Quality Control (NCR + CAPA).
 * Non-Conformance Reports raised on site, with CAPA workflow.
 */
export default function MobileQualityControlPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileQualityControlContent />
    </Suspense>
  );
}

async function MobileQualityControlContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const [ncrs, projects, subcontractors] = await Promise.all([
    prisma.nonConformanceReport.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        project: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, name: true, trade: true } },
        capa: { select: { id: true, status: true, capaNumber: true } },
      },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
    canManage
      ? prisma.subcontractor.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, trade: true },
        })
      : [],
  ]);

  const open = ncrs.filter((n) => n.status === "OPEN" || n.status === "UNDER_REVIEW").length;
  const capaRequired = ncrs.filter((n) => n.status === "CAPA_REQUIRED").length;
  const closed = ncrs.filter((n) => n.status === "CLOSED").length;

  const serialized = ncrs.map((n) => ({
    id: n.id,
    ncrNumber: n.ncrNumber,
    title: n.title,
    severity: n.severity,
    status: n.status,
    category: n.category,
    projectName: n.project.name,
    subcontractorName: n.subcontractor?.name ?? null,
    location: n.location,
    hasCapa: !!n.capa,
    capaStatus: n.capa?.status ?? null,
    raisedAt: n.raisedAt.toISOString(),
  }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="Open" value={String(open)} icon={ClipboardCheck} tone={open > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="CAPA Req" value={String(capaRequired)} icon={ClipboardCheck} tone={capaRequired > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Closed" value={String(closed)} icon={ClipboardCheck} tone={closed > 0 ? "go" : "neutral"} />
      </div>

      <MobileExportShareBar
        title="Quality Control — NCRs"
        rows={serialized as unknown as Record<string, unknown>[]}
        columns={[
          { key: "ncrNumber", label: "NCR Number" },
          { key: "title", label: "Title" },
          { key: "projectName", label: "Project" },
          { key: "severity", label: "Severity" },
          { key: "status", label: "Status" },
          { key: "category", label: "Category" },
        ] as MobileColumnSpec[]}
        summary={`${serialized.length} NCRs`}
      />

      <MobileNcrList items={serialized} />

      {ncrs.length === 0 && (
        <MobileEmptyState
          icon={ClipboardCheck}
          title="No NCRs raised"
          hint={
            canManage
              ? projects.length === 0
                ? "Create a project first, then raise NCRs for quality issues"
                : "Tap + to raise a Non-Conformance Report"
              : "NCRs will appear here"
          }
          action={
            canManage && projects.length === 0 ? (
              <MobileCta href="/m/projects" icon={Plus} variant="primary">Go to Projects</MobileCta>
            ) : undefined
          }
        />
      )}

      {canManage && projects.length > 0 && (
        <MobileNcrFab projects={projects} subcontractors={subcontractors} />
      )}
    </div>
  );
}
