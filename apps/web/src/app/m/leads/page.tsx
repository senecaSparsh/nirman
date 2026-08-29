import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileLeadsList, type LeadListItem } from "./MobileLeadsList";

/**
 * /m/leads — mobile lead pipeline. Shows stage, priority and follow-up
 * info so sales reps and managers can triage who to call next.
 */
export default function MobileLeadsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileLeadsContent />
    </Suspense>
  );
}

async function MobileLeadsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.SALE_CREATE);

  const leads = await prisma.lead.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      project: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const now = new Date();

  const rows: LeadListItem[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email ?? null,
    source: l.source,
    stage: l.stage,
    priority: l.priority,
    score: l.score,
    projectName: l.project?.name ?? null,
    assignedToName: l.assignedTo?.name ?? null,
    nextFollowUpAt: l.nextFollowUpAt ? l.nextFollowUpAt.toISOString() : null,
    lastContactAt: l.lastContactAt ? l.lastContactAt.toISOString() : null,
    budgetMin: l.budgetMin ? toNum(l.budgetMin) : null,
    budgetMax: l.budgetMax ? toNum(l.budgetMax) : null,
    interestedUnitType: l.interestedUnitType ?? null,
    convertedAt: l.convertedAt ? l.convertedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  }));

  const hotCount = rows.filter((l) => l.priority === "HOT").length;
  const bookedCount = rows.filter((l) => l.stage === "BOOKED").length;
  const followUpsDue = rows.filter(
    (l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= now,
  ).length;

  const exportColumns: MobileColumnSpec[] = [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "source", label: "Source" },
    { key: "stage", label: "Stage" },
    { key: "priority", label: "Priority" },
    { key: "score", label: "Score" },
    { key: "projectName", label: "Project" },
    { key: "assignedToName", label: "Assigned To" },
    { key: "budgetMin", label: "Budget Min", format: "currency" },
    { key: "budgetMax", label: "Budget Max", format: "currency" },
    { key: "nextFollowUpAt", label: "Next Follow-up", format: "date" },
  ];

  return (
    <div>
      <MobileLeadsList
        items={rows}
        hotCount={hotCount}
        bookedCount={bookedCount}
        followUpsDue={followUpsDue}
        canCreate={canCreate}
        exportTitle="Leads"
        exportRows={rows as unknown as Record<string, unknown>[]}
        exportColumns={exportColumns}
        exportSummary={`${rows.length} leads · ${hotCount} hot · ${bookedCount} booked`}
      />
    </div>
  );
}
