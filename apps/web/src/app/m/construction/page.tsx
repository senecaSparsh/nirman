import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getBoqTree, getWbsTree } from "@nirman/services";
import {
  Wrench,
  GitBranch,
  ClipboardCheck,
  ListTree,
  BookOpen,
  FileText,
  Package,
} from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrencyCompact, formatNumber } from "@/lib/utils";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  Badge,
} from "@/components/mobile/v2/primitives";
import { PageLead, NextActionCardView } from "@/components/mobile/v2/guidance";
import { FLOWS } from "@/lib/flow-map";
import { MobileConstructionHubTabs } from "../MobileConstructionHubTabs";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

// ── List components (reused from their existing pages, unchanged) ──
import { MobileBoqProjectSelector, type BoqProjectOption } from "../boq/MobileBoqProjectSelector";
import { MobileBoqFab } from "../boq/MobileNewBoqItemDialog";
import { MobileWbsProjectSelector } from "../wbs/MobileWbsProjectSelector";
import { MobileWbsFab } from "../wbs/MobileNewWbsNodeDialog";
import { MobileMbProjectSelector } from "../measurement-book/MobileMbProjectSelector";
import { MobileMbFab } from "../measurement-book/MobileNewMbEntryDialog";
import { MobileWorkOrdersList, type WorkOrderListItem } from "../work-orders/MobileWorkOrdersList";
import { MobileWorkOrdersFab } from "../work-orders/MobileWorkOrdersFab";
import { MobileWorkOrdersEmptyState } from "../work-orders/MobileWorkOrdersEmptyState";
import { MobileChangeOrdersList, type ChangeOrderListItem } from "../change-orders/MobileChangeOrdersList";
import { MobileChangeOrdersFab } from "../change-orders/MobileChangeOrdersFab";
import { MobileNcrList, type NcrListItem } from "../quality-control/MobileNcrList";
import { MobileNcrFab } from "../quality-control/MobileNcrFab";
import {
  MobileSafetyContent,
  type IncidentListItem,
  type HazardListItem,
  type InspectionListItem,
} from "../safety/MobileSafetyContent";

/**
 * /m/construction — Construction hub. Groups Work Orders, Change Orders,
 * Quality Control, Safety, BOQ, WBS, and Measurement Book into one tabbed
 * page — same pattern as /m/stock.
 *
 * BOQ/WBS/MB are project-scoped, so those tabs include a project selector
 * and accept a `?project=` param (preserved alongside `?tab=`).
 */
export default function MobileConstructionHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <ConstructionHubContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ConstructionHubContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; project?: string }>;
}) {
  await connection();
  const { tab, project: projectId } = await searchParams;

  const validTabs = ["work-orders", "change-orders", "quality", "safety", "boq", "wbs", "mb"];
  const activeTab = validTabs.includes(tab ?? "") ? tab! : "work-orders";

  let content: React.ReactNode;
  if (activeTab === "change-orders") {
    content = <ConstructionChangeOrdersTab />;
  } else if (activeTab === "quality") {
    content = <ConstructionQualityTab />;
  } else if (activeTab === "safety") {
    content = <ConstructionSafetyTab />;
  } else if (activeTab === "boq") {
    content = <ConstructionBoqTab projectId={projectId} />;
  } else if (activeTab === "wbs") {
    content = <ConstructionWbsTab projectId={projectId} />;
  } else if (activeTab === "mb") {
    content = <ConstructionMbTab projectId={projectId} />;
  } else {
    content = <ConstructionWorkOrdersTab />;
  }

  return (
    <MobileConstructionHubTabs activeTab={activeTab}>
      {content}
    </MobileConstructionHubTabs>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB CONTENT COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Work Orders tab — mirrors /m/work-orders */
async function ConstructionWorkOrdersTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);

  const [workOrders, projects, subcontractors] = await Promise.all([
    prisma.subcontractorWorkOrder.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        subcontractor: { select: { id: true, name: true, trade: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { raBills: true, lines: true } },
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

  const draft = workOrders.filter((w) => w.status === "DRAFT").length;
  const active = workOrders.filter((w) => w.status === "ACTIVE" || w.status === "ISSUED").length;
  const completed = workOrders.filter((w) => w.status === "COMPLETED" || w.status === "CLOSED").length;

  const serialized: WorkOrderListItem[] = workOrders.map((w) => ({
    id: w.id,
    workOrderNumber: w.workOrderNumber,
    workTitle: w.workTitle,
    status: w.status,
    subcontractorName: w.subcontractor.name,
    subcontractorTrade: w.subcontractor.trade ?? null,
    projectName: w.project.name,
    lineCount: w._count.lines,
    raBillCount: w._count.raBills,
    startDate: w.startDate?.toISOString() ?? null,
    endDate: w.endDate?.toISOString() ?? null,
    retentionPct: toNum(w.retentionPct),
    advanceAmount: w.advanceAmount ? toNum(w.advanceAmount) : null,
  }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <MobileStatCard label="Draft" value={String(draft)} icon={Wrench} tone={draft > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Active" value={String(active)} icon={Wrench} tone={active > 0 ? "go" : "neutral"} />
        <MobileStatCard label="Completed" value={String(completed)} icon={Wrench} />
      </div>
      <MobileWorkOrdersList
        items={serialized}
        exportTitle="Work Orders"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={[
          { key: "workOrderNumber", label: "WO Number" },
          { key: "subcontractorName", label: "Subcontractor" },
          { key: "projectName", label: "Project" },
          { key: "workTitle", label: "Scope" },
          { key: "status", label: "Status" },
          { key: "advanceAmount", label: "Advance", format: "currency" },
        ] as MobileColumnSpec[]}
        exportSummary={`${serialized.length} work orders`}
      />
      {workOrders.length === 0 && (
        <MobileWorkOrdersEmptyState
          canManage={canManage}
          hasProjects={projects.length > 0}
          hasSubcontractors={subcontractors.length > 0}
        />
      )}
      {canManage && projects.length > 0 && subcontractors.length > 0 && (
        <MobileWorkOrdersFab projects={projects} subcontractors={subcontractors} />
      )}
    </div>
  );
}

/** Change Orders tab — mirrors /m/change-orders */
async function ConstructionChangeOrdersTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const [changeOrders, projects] = await Promise.all([
    prisma.changeOrder.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        project: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const draft = changeOrders.filter((c) => c.status === "DRAFT").length;
  const pending = changeOrders.filter((c) => c.status === "SUBMITTED").length;
  const approved = changeOrders.filter((c) => c.status === "APPROVED" || c.status === "IMPLEMENTED").length;

  const serialized: ChangeOrderListItem[] = changeOrders.map((c) => ({
    id: c.id,
    changeOrderNo: c.changeOrderNo,
    title: c.title,
    status: c.status,
    type: c.type,
    reason: c.reason,
    projectName: c.project.name,
    phaseName: c.phase?.name ?? null,
    lineCount: c._count.lines,
    costDelta: toNum(c.costDelta),
    scheduleDeltaDays: c.scheduleDeltaDays,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <MobileStatCard label="Draft" value={String(draft)} icon={GitBranch} tone={draft > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Pending" value={String(pending)} icon={GitBranch} tone={pending > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Approved" value={String(approved)} icon={GitBranch} tone={approved > 0 ? "go" : "neutral"} />
      </div>
      <MobileChangeOrdersList
        items={serialized}
        exportTitle="Change Orders"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={[
          { key: "changeOrderNo", label: "CO Number" },
          { key: "title", label: "Title" },
          { key: "projectName", label: "Project" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "costDelta", label: "Cost Delta", format: "currency" },
        ] as MobileColumnSpec[]}
        exportSummary={`${serialized.length} change orders`}
      />
      {changeOrders.length === 0 && (
        <MobileEmptyState
          icon={GitBranch}
          title="No change orders"
          hint={canManage ? (projects.length === 0 ? "Create a project first, then track scope changes here" : "Tap + to create a change order for a project") : "Change orders will appear here"}
        />
      )}
      {canManage && projects.length > 0 && <MobileChangeOrdersFab projects={projects} />}
    </div>
  );
}

/** Quality Control tab — mirrors /m/quality-control */
async function ConstructionQualityTab() {
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
  const openNcrCount = ncrs.filter((n) => n.status === "OPEN").length;
  const listNext = FLOWS.ncr.listNext;

  const serialized: NcrListItem[] = ncrs.map((n) => ({
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
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <MobileStatCard label="Open" value={String(open)} icon={ClipboardCheck} tone={open > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="CAPA Req" value={String(capaRequired)} icon={ClipboardCheck} tone={capaRequired > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Closed" value={String(closed)} icon={ClipboardCheck} tone={closed > 0 ? "go" : "neutral"} />
      </div>
      <PageLead flow="ncr" />
      {listNext && canManage && openNcrCount > 0 ? (
        <NextActionCardView
          label={listNext.label(openNcrCount)}
          reason={listNext.reason}
          tone="signal"
          href={`/m/construction?tab=quality`}
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
          hint={canManage ? (projects.length === 0 ? "Create a project first, then raise NCRs for quality issues" : "Tap + to raise a Non-Conformance Report") : "NCRs will appear here"}
        />
      )}
      {canManage && projects.length > 0 && (
        <MobileNcrFab projects={projects} subcontractors={subcontractors} />
      )}
    </div>
  );
}

/** Safety tab — mirrors /m/safety */
async function ConstructionSafetyTab() {
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

  const serializedIncidents: IncidentListItem[] = incidents.map((i) => ({
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

  const serializedHazards: HazardListItem[] = hazards.map((h) => ({
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

  const serializedInspections: InspectionListItem[] = inspections.map((i) => ({
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

/* ── Project-scoped tabs (BOQ / WBS / MB) ────────────────────────────────
 * These tabs need a project selector. The ?project= param is preserved
 * alongside ?tab= so deep links work.
 * ──────────────────────────────────────────────────────────────────────── */

type BoqRow = {
  id: string;
  serialNo: string;
  description: string;
  type: "SECTION" | "SUBSECTION" | "LINE_ITEM";
  level: number;
  unit: string | null;
  estimatedQty: number | null;
  rate: number | null;
  estimatedAmount: number | null;
};

type BoqTreeNode = {
  id: string;
  serialNo: string;
  description: string;
  type: "SECTION" | "SUBSECTION" | "LINE_ITEM";
  unit: string | null;
  estimatedQty: { toNumber: () => number } | null;
  rate: { toNumber: () => number } | null;
  estimatedAmount: { toNumber: () => number } | null;
  children: BoqTreeNode[];
};

function flattenTree(nodes: BoqTreeNode[], level: number, out: BoqRow[]): void {
  for (const node of nodes) {
    out.push({
      id: node.id,
      serialNo: node.serialNo,
      description: node.description,
      type: node.type,
      level,
      unit: node.unit,
      estimatedQty: node.estimatedQty != null ? toNum(node.estimatedQty) : null,
      rate: node.rate != null ? toNum(node.rate) : null,
      estimatedAmount: node.estimatedAmount != null ? toNum(node.estimatedAmount) : null,
    });
    if (node.children && node.children.length > 0) {
      flattenTree(node.children, level + 1, out);
    }
  }
}

function BoqRowCard({ row }: { row: BoqRow }) {
  const isLineItem = row.type === "LINE_ITEM";
  const indent = row.level * 12;

  const typeTone: "neutral" | "signal" | "go" =
    row.type === "SECTION" ? "signal" : row.type === "SUBSECTION" ? "neutral" : "go";

  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{
        marginLeft: indent,
        borderColor: "var(--color-paper-3)",
        backgroundColor: isLineItem ? "var(--color-paper)" : "color-mix(in srgb, var(--color-brand) 4%, var(--color-paper))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-400)" }}>
              {row.serialNo}
            </span>
            <Badge tone={typeTone}>{row.type.replace("_", " ").toLowerCase()}</Badge>
          </div>
          <p className="text-m-body font-medium" style={{ color: "var(--color-ink-900)" }}>
            {row.description}
          </p>
        </div>
      </div>
      {isLineItem && (row.estimatedQty != null || row.rate != null) && (
        <div className="mt-1.5 flex items-center gap-3 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          {row.estimatedQty != null && <span>Qty: {formatNumber(row.estimatedQty, 2)} {row.unit ?? ""}</span>}
          {row.rate != null && <span>Rate: {formatCurrencyCompact(row.rate)}</span>}
          {row.estimatedAmount != null && (
            <span className="font-semibold" style={{ color: "var(--color-ink-800)" }}>
              Amt: {formatCurrencyCompact(row.estimatedAmount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** BOQ tab — mirrors /m/boq (project-scoped) */
async function ConstructionBoqTab({ projectId }: { projectId?: string }) {
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.BOQ_VIEW)) {
    return <MobileEmptyState icon={ListTree} title="No access" hint="You don't have permission to view BOQ" />;
  }

  const projects: BoqProjectOption[] = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : undefined;

  if (!projectId || !selectedProject) {
    return (
      <div>
        <MobileBoqProjectSelector projects={projects} selectedId={projectId} />
        <MobileEmptyState icon={ListTree} title="Select a project" hint="Choose a project above to view its Bill of Quantities" />
      </div>
    );
  }

  const [boqResult, materials, canManage] = await Promise.all([
    getBoqTree(projectId),
    hasPermission(role, PERM.BOQ_MANAGE)
      ? prisma.material.findMany({
          where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unit: true },
        })
      : [],
    Promise.resolve(hasPermission(role, PERM.BOQ_MANAGE)),
  ]);

  const { tree, totalEstimatedAmount } = boqResult;
  const rows: BoqRow[] = [];
  flattenTree(tree as unknown as BoqTreeNode[], 0, rows);

  const lineItemCount = rows.filter((r) => r.type === "LINE_ITEM").length;
  const totalAmount = toNum(totalEstimatedAmount);
  const parentItems = rows
    .filter((r) => r.type === "SECTION" || r.type === "SUBSECTION")
    .map((r) => ({ id: r.id, serialNo: r.serialNo, description: r.description, type: r.type }));

  return (
    <div>
      <MobileBoqProjectSelector projects={projects} selectedId={projectId} />
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        <MobileStatCard label="Line Items" value={formatNumber(lineItemCount, 0)} hint="billable lines" icon={Package} />
        <MobileStatCard label="Est. Amount" value={formatCurrencyCompact(totalAmount)} hint="total budget" icon={FileText} tone="signal" />
      </div>
      <MobileSectionTitle right={<Badge tone="steel">{rows.length} nodes</Badge>}>
        Bill of Quantities Tree
      </MobileSectionTitle>
      {rows.length === 0 ? (
        <MobileEmptyState icon={ListTree} title="No Bill of Quantities items" hint={canManage ? "Tap + to add the first section or line item" : "This project doesn't have a Bill of Quantities yet"} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => <BoqRowCard key={row.id} row={row} />)}
        </div>
      )}
      {canManage && (
        <MobileBoqFab
          projectId={projectId}
          parentItems={parentItems}
          materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))}
        />
      )}
    </div>
  );
}

/** WBS tab — mirrors /m/wbs (project-scoped) */
async function ConstructionWbsTab({ projectId }: { projectId?: string }) {
  const company = await getCompany();
  const role = await getUserRole();
  const canView = hasPermission(role, PERM.WBS_VIEW);
  const canManage = hasPermission(role, PERM.WBS_MANAGE);

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!canView) {
    return <MobileEmptyState icon={ListTree} title="No access" hint="You don't have permission to view WBS" />;
  }

  if (!projectId) {
    return (
      <div>
        <MobileWbsProjectSelector projects={projects} selectedId={projectId} />
        <MobileEmptyState icon={ListTree} title="Select a project" hint="Choose a project above to view its Work Breakdown Structure" />
      </div>
    );
  }

  const [wbsTree, boqItems] = await Promise.all([
    getWbsTree(projectId),
    canManage
      ? prisma.boqItem.findMany({
          where: { projectId, type: "LINE_ITEM" },
          orderBy: { serialNo: "asc" },
          select: { id: true, serialNo: true, description: true, unit: true },
        })
      : [],
  ]);

  type WbsNode = Awaited<ReturnType<typeof getWbsTree>>[number] & { children?: WbsNode[] };
  const nodes = wbsTree as unknown as WbsNode[];

  function renderNode(node: WbsNode, level: number): React.ReactNode {
    const indent = level * 12;
    return (
      <div key={node.id}>
        <div
          className="rounded-[0.5rem] border p-2.5 mb-1"
          style={{ marginLeft: indent, borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-400)" }}>{node.code}</span>
            {node.boqItemId && <Badge tone="go">linked</Badge>}
          </div>
          <p className="text-m-body font-medium" style={{ color: "var(--color-ink-900)" }}>{node.name}</p>
          {node.plannedStart && node.plannedEnd && (
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {new Date(node.plannedStart).toLocaleDateString()} → {new Date(node.plannedEnd).toLocaleDateString()}
            </p>
          )}
        </div>
        {node.children && node.children.length > 0 && (
          <div>{node.children.map((c) => renderNode(c, level + 1))}</div>
        )}
      </div>
    );
  }

  const parentNodes = nodes.map((n) => ({ id: n.id, code: n.code, name: n.name, type: n.type }));

  return (
    <div>
      <MobileWbsProjectSelector projects={projects} selectedId={projectId} />
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        <MobileStatCard label="Nodes" value={formatNumber(nodes.length, 0)} icon={ListTree} />
        <MobileStatCard label="Linked BOQ" value={formatNumber(nodes.filter((n) => n.boqItemId).length, 0)} icon={Package} tone="go" />
      </div>
      <MobileSectionTitle right={<Badge tone="steel">{nodes.length} nodes</Badge>}>
        Work Breakdown Structure
      </MobileSectionTitle>
      {nodes.length === 0 ? (
        <MobileEmptyState icon={ListTree} title="No WBS nodes" hint={canManage ? "Tap + to add the first node" : "This project doesn't have a WBS yet"} />
      ) : (
        <div className="flex flex-col gap-1.5">{nodes.map((n) => renderNode(n, 0))}</div>
      )}
      {canManage && (
        <MobileWbsFab
          projectId={projectId}
          parentNodes={parentNodes}
          boqItems={boqItems.map((b) => ({ id: b.id, serialNo: b.serialNo, description: b.description, unit: b.unit }))}
        />
      )}
    </div>
  );
}

/** Measurement Book tab — mirrors /m/measurement-book (project-scoped) */
async function ConstructionMbTab({ projectId }: { projectId?: string }) {
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.MB_VERIFY);

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!projectId) {
    return (
      <div>
        <MobileMbProjectSelector projects={projects} selectedId={null} />
        <MobileEmptyState icon={BookOpen} title="Select a project" hint="Choose a project to view measurement book entries" />
      </div>
    );
  }

  const [entries, boqItems, wbsNodes] = await Promise.all([
    prisma.measurementBookEntry.findMany({
      where: { projectId },
      orderBy: { measureDate: "desc" },
      take: 50,
      include: {
        boqItem: { select: { id: true, serialNo: true, description: true, unit: true, rate: true } },
        measuredBy: { select: { id: true, name: true } },
      },
    }),
    prisma.boqItem.findMany({
      where: { projectId, type: "LINE_ITEM" },
      orderBy: { serialNo: "asc" },
      select: { id: true, serialNo: true, description: true, unit: true, rate: true },
    }),
    prisma.wbsNode.findMany({
      where: { projectId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, boqItemId: true },
    }),
  ]);

  const totalMeasured = entries.reduce((s, e) => s + toNum(e.measuredQty), 0);
  const totalValue = entries.reduce((s, e) => {
    const rate = e.boqItem.rate ? toNum(e.boqItem.rate) : 0;
    return s + toNum(e.measuredQty) * rate;
  }, 0);

  const serialized = entries.map((e) => ({
    id: e.id,
    mbNumber: e.mbNumber,
    boqSerialNo: e.boqItem.serialNo,
    boqDescription: e.boqItem.description,
    unit: e.boqItem.unit ?? "",
    measuredQty: toNum(e.measuredQty),
    rate: e.boqItem.rate ? toNum(e.boqItem.rate) : 0,
    amount: toNum(e.measuredQty) * (e.boqItem.rate ? toNum(e.boqItem.rate) : 0),
    measureDate: e.measureDate.toISOString(),
    description: e.description,
    measuredByName: e.measuredBy?.name ?? "—",
    status: e.status,
  }));

  return (
    <div>
      <MobileMbProjectSelector projects={projects} selectedId={projectId} />
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        <MobileStatCard label="Entries" value={String(entries.length)} icon={BookOpen} />
        <MobileStatCard label="Total Measured" value={formatNumber(totalMeasured, 2)} icon={BookOpen} tone="neutral" />
        <MobileStatCard label="Earned Value" value={formatCurrencyCompact(totalValue)} icon={BookOpen} tone="go" />
        <MobileStatCard label="BOQ Items" value={String(boqItems.length)} icon={BookOpen} />
      </div>
      {serialized.length === 0 ? (
        <MobileEmptyState icon={BookOpen} title="No measurement entries" hint={canCreate ? "Tap + to record the first measured work" : "Measurement entries will appear here"} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {serialized.map((e) => (
            <div key={e.id} className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-400)" }}>{e.mbNumber}</span>
                    <Badge tone={e.status === "APPROVED" ? "go" : e.status === "DRAFT" ? "neutral" : "signal"}>{e.status}</Badge>
                  </div>
                  <p className="text-m-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                    {e.boqSerialNo} · {e.boqDescription}
                  </p>
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                    {new Date(e.measureDate).toLocaleDateString()} · {e.measuredByName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-900)" }}>
                    {formatNumber(e.measuredQty, 2)} {e.unit}
                  </p>
                  <p className="text-m-caption font-semibold" style={{ color: "var(--color-go)" }}>
                    {formatCurrencyCompact(e.amount)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {canCreate && (
        <MobileMbFab
          projectId={projectId}
          boqItems={boqItems.map((b) => ({ id: b.id, serialNo: b.serialNo, description: b.description, unit: b.unit, rate: b.rate ? toNum(b.rate) : 0 }))}
          wbsNodes={wbsNodes.map((w) => ({ id: w.id, code: w.code, name: w.name, boqItemId: w.boqItemId }))}
        />
      )}
    </div>
  );
}
