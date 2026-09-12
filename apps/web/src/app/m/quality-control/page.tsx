import { prisma } from "@nirman/db";
import { scopeWhere, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { PageLead, NextActionCardView } from "@/components/mobile/v2/guidance";
import { FLOWS } from "@/lib/flow-map";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { ClipboardCheck, Plus } from "lucide-react";
import { MobileNcrList } from "./MobileNcrList";
import { DepartmentActivityFeed } from "@/components/department-activity-feed";
import { MobileNcrFab } from "./MobileNcrFab";

/**
 * /m/quality-control — mobile Quality Control (NCR + CAPA).
 * Non-Conformance Reports raised on site, with CAPA workflow.
 */
export default function MobileQualityControlPage() {
  return (
    <MobileListPage perm={PERM.QC_VIEW} managePerm={PERM.QC_MANAGE} what="quality control">
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const canCreateNcr = actions?.canCreateNcr ?? canManage;
        const [ncrs, projects, subcontractors] = await Promise.all([
          prisma.nonConformanceReport.findMany({
            where: {...await scopeWhere("NonConformanceReport"),  companyId: company.id },
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
        const openNcrCount = ncrs.filter((n) => n.status === "OPEN").length;
        const listNext = FLOWS.ncr.listNext;

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
            <DepartmentActivityFeed department="quality" />
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              <MobileStatCard label="Open" value={String(open)} icon={ClipboardCheck} tone={open > 0 ? "signal" : "neutral"} />
              <MobileStatCard label="CAPA Req" value={String(capaRequired)} icon={ClipboardCheck} tone={capaRequired > 0 ? "signal" : "neutral"} />
              <MobileStatCard label="Closed" value={String(closed)} icon={ClipboardCheck} tone={closed > 0 ? "go" : "neutral"} />
            </div>

            {/* ── Orientation: what is this page + what to do next ── */}
            <PageLead flow="ncr" />
            {listNext && canManage && openNcrCount > 0 ? (
              <NextActionCardView
                label={listNext.label(openNcrCount)}
                reason={listNext.reason}
                tone="signal"
                href={`/m/quality-control?status=${listNext.filterChip}`}
              />
            ) : null}

            <MobileNcrList
              items={serialized}
              exportTitle="Quality Control — NCRs"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={[
                { key: "ncrNumber", label: "NCR Number" },
                { key: "title", label: "Title" },
                { key: "projectName", label: "Project" },
                { key: "severity", label: "Severity" },
                { key: "status", label: "Status" },
                { key: "category", label: "Category" },
              ] as MobileColumnSpec[]}
              exportSummary={`${serialized.length} NCRs`}
            />

            {ncrs.length === 0 && (
              <MobileEmptyState
                icon={ClipboardCheck}
                title="No NCRs raised"
                hint={
                  canCreateNcr
                    ? projects.length === 0
                      ? "Create a project first, then raise NCRs for quality issues"
                      : "Tap + to raise a Non-Conformance Report"
                    : "NCRs will appear here"
                }
                action={
                  canCreateNcr && projects.length === 0 ? (
                    <MobileCta href="/m/real-estate?tab=projects" icon={Plus} variant="primary">Go to Projects</MobileCta>
                  ) : undefined
                }
              />
            )}

            {canCreateNcr && projects.length > 0 && (
              <MobileNcrFab projects={projects} subcontractors={subcontractors} />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
