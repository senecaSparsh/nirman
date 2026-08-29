import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobilePipelineStepper, type MobilePipelineStep } from "@/components/mobile/v2/primitives";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { resolveNextAction } from "@/lib/flow-map";
import { MobileMaterialIssueDetailClient } from "./MobileMaterialIssueDetailClient";

export default function MobileMaterialIssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={4} />}>
      <MobileMaterialIssueDetailContent params={params} />
    </Suspense>
  );
}

async function MobileMaterialIssueDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canIssue = hasPermission(role, PERM.STOCK_ISSUE);
  const { id } = await params;

  const issue = await prisma.materialIssue.findFirst({
    where: {
      id,
      OR: [
        { project: { companyId: company.id } },
        { department: { companyId: company.id } },
      ],
    },
    include: {
      project: { select: { id: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
      builtUnit: { select: { id: true, unitNumber: true } },
      subcontractor: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      fromLocation: { select: { id: true, name: true } },
      issuedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true, hsnCode: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!issue) {
    return <MobileMaterialIssueDetailClient notFound canCancel={false} />;
  }

  const data = {
    id: issue.id,
    issueNumber: issue.issueNumber,
    status: issue.status,
    issueDate: issue.issueDate.toISOString(),
    cancelledAt: issue.cancelledAt?.toISOString() ?? null,
    cancelledByName: issue.cancelledBy?.name ?? null,
    issuedByName: issue.issuedBy?.name ?? null,
    notes: issue.notes,
    receiverName: issue.receiverName,
    receiverMobile: issue.receiverMobile,
    vehicleNumber: issue.vehicleNumber,
    vehicleType: issue.vehicleType,
    driverName: issue.driverName,
    driverPhone: issue.driverPhone,
    totalCost: toNum(issue.totalCost),
    roundOff: toNum(issue.roundOff),
    totalAmount: toNum(issue.totalAmount),
    projectName: issue.project?.name ?? null,
    projectId: issue.project?.id ?? null,
    departmentName: issue.department ? `${issue.department.code} — ${issue.department.name}` : null,
    builtUnitNumber: issue.builtUnit?.unitNumber ?? null,
    subcontractorName: issue.subcontractor?.name ?? null,
    subcontractorId: issue.subcontractor?.id ?? null,
    phaseName: issue.phase?.name ?? null,
    fromLocationName: issue.fromLocation.name,
    lines: issue.lines.map((l) => ({
      id: l.id,
      materialCode: l.material.code,
      materialName: l.material.name,
      materialUnit: l.material.unit,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
      lineTotal: toNum(l.qty) * toNum(l.unitCost),
    })),
  };

  // Lifecycle pipeline: PENDING → COMPLETED → CANCELLED
  const issuePipelineSteps: MobilePipelineStep[] = issue.status === "CANCELLED"
    ? [
        { label: "Pending", state: "done" },
        { label: "Completed", state: "skipped" },
        { label: "Cancelled", state: "current" },
      ]
    : [
        { label: "Pending", state: issue.status === "PENDING" ? "current" : "done" },
        { label: "Completed", state: issue.status === "COMPLETED" ? "current" : "pending" },
        { label: "Cancelled", state: "pending" },
      ];

  const nextAction = resolveNextAction("materialIssue", issue.status, role);

  return (
    <>
      {/* ── Next action — the one thing to do, doable on this page ── */}
      {nextAction ? (
        <NextActionCardView
          label={nextAction.label}
          reason={nextAction.reason}
          tone={nextAction.tone ?? "signal"}
          hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
          href={nextAction.action.type === "navigate" ? nextAction.action.href.replace("{id}", issue.id) : undefined}
        />
      ) : null}

      <div className="mb-3 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <MobilePipelineStepper steps={issuePipelineSteps} />
      </div>
      <MobileMaterialIssueDetailClient issue={data} canCancel={canIssue && issue.status === "COMPLETED"} />
    </>
  );
}
