import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Printer } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileEmptyState,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";
import { MobileRequisitionActions } from "@/components/mobile/mobile-requisition-actions";
import { MobileDetailActions } from "@/components/mobile/mobile-detail-actions";

/**
 * /m/requisitions/[id] — requisition detail with lines and inline
 * submit / approve / reject / convert-to-PO actions.
 */
export default function MobileRequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRequisitionDetailContent params={params} />
    </Suspense>
  );
}

async function MobileRequisitionDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const req = await prisma.materialRequisition.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true, currentCost: true } },
          preferredSupplier: { select: { id: true, name: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!req) {
    return (
      <div>
        <MobileDetailHeader title="Requisition" backHref="/m/requisitions" />
        <MobileEmptyState title="Requisition not found" />
      </div>
    );
  }

  const canApprove = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canManage = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  // For the convert form: suppliers + company/project stock locations.
  const [suppliers, locations] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true, projectId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const lines = req.lines.map((l) => ({
    id: l.id,
    materialId: l.material.id,
    materialName: l.material.name,
    materialCode: l.material.code,
    unit: l.material.unit,
    qtyRequested: toNum(l.qtyRequested),
    notes: l.notes,
    currentStock: l.currentStock != null ? toNum(l.currentStock) : null,
    lastRate: l.lastRate != null ? toNum(l.lastRate) : null,
    suggestedCost: toNum(l.material.currentCost),
    preferredSupplierId: l.preferredSupplierId,
  }));

  const reqPayload = {
    id: req.id,
    reqNumber: req.reqNumber,
    status: req.status,
    projectName: req.project.name,
    projectId: req.project.id,
    phaseName: req.phase?.name ?? null,
    requestDate: req.requestDate.toISOString(),
    neededByDate: req.neededByDate?.toISOString() ?? null,
    notes: req.notes,
    rejectReason: req.rejectReason,
    convertedPoId: req.convertedPoId,
  };

  return (
    <div>
      <MobileDetailHeader
        title={req.reqNumber}
        subtitle={req.project.name}
        backHref="/m/requisitions"
        right={<MobileStatusBadge status={req.status} />}
      />

      <MobileSectionTitle>Summary</MobileSectionTitle>
      <div>
        <Link
          href={`/m/projects/${req.project.id}`}
          className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-body text-foreground">Project</div>
          </div>
          <span className="shrink-0 truncate text-body font-semibold text-brand">{req.project.name}</span>
        </Link>
        {req.phase && <MobileInfoRow title="Phase" value={req.phase.name} />}
        <MobileInfoRow title="Requested" value={formatDate(req.requestDate)} />
        {req.neededByDate && <MobileInfoRow title="Needed by" value={formatDate(req.neededByDate)} />}
        {req.rejectReason && <MobileInfoRow title="Reject reason" value={req.rejectReason} />}
        {req.convertedPoId && (
          <Link
            href={`/m/procurement/${req.convertedPoId}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-foreground">Converted to PO</div>
            </div>
            <span className="shrink-0 text-body font-semibold text-brand">View PO →</span>
          </Link>
        )}
      </div>

      <MobileSectionTitle>Lines ({lines.length})</MobileSectionTitle>
      <div>
        {lines.map((l) => (
          <Link
            key={l.id}
            href={`/m/materials/${l.materialId}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-foreground">{l.materialName} · {l.materialCode}</div>
              <div className="truncate text-caption text-muted-foreground">
                {formatNumber(l.qtyRequested, 0)} {l.unit}
                {l.currentStock != null ? ` · stock ${formatNumber(l.currentStock, 0)}` : ""}
                {l.lastRate != null ? ` · last ${formatCurrency(l.lastRate)}` : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <MobileRequisitionActions
        requisition={reqPayload}
        lines={lines}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId }))}
        canApprove={canApprove}
        canManage={canManage}
      />

      {/* ── Print ─────────────────────────────────────────────── */}
      <MobileDetailActions
        links={[
          {
            label: "Print Requisition",
            icon: Printer,
            href: `/print/requisition/${req.id}`,
            variant: "outline",
          },
        ]}
      />
    </div>
  );
}
