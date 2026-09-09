import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {type MobileColumnSpec} from "@/components/mobile/v2/export-share-bar";
import { MobileLeadsList, type LeadListItem } from "./MobileLeadsList";

/**
 * /m/leads — mobile lead pipeline. Shows stage, priority and follow-up
 * info so sales reps and managers can triage who to call next.
 */
export default function MobileLeadsPage() {
  return (
    <MobileListPage perm={PERM.SALES_VIEW} managePerm={PERM.SALE_CREATE} what="leads" permission="sales.view">
      {async ({ company, canManage }) => {
        const BATCH_SIZE = 40;
        const leads = await prisma.lead.findMany({
          where: {...await scopeWhere("Lead"),  companyId: company.id, deletedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            project: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
          },
        });

        const hasMore = leads.length > BATCH_SIZE;
        const batch = hasMore ? leads.slice(0, BATCH_SIZE) : leads;
        const last = batch[batch.length - 1];
        const nextCursor = hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null;

        // Dropdown data for the inline new-lead FAB modal.
        const [newLeadProjects, newLeadUnits, newLeadAssignees] = canManage
          ? await Promise.all([
              prisma.project.findMany({
                where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              }),
              prisma.builtUnit.findMany({
                where: {...await scopeWhere("BuiltUnit"), 
                  deletedAt: null,
                  status: { in: ["AVAILABLE", "HOLD"] },
                  project: { companyId: company.id, deletedAt: null },
                },
                orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
                select: { id: true, unitNumber: true, unitType: true, projectId: true, project: { select: { name: true } } },
              }),
              prisma.userCompany.findMany({
                where: {
                  companyId: company.id,
                  role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "SALES_MANAGER"] },
                  user: { active: true, isHidden: { not: true } },
                },
                orderBy: { user: { name: "asc" } },
                select: { user: { select: { id: true, name: true } } },
              }),
            ])
          : [[], [], []];

        const now = new Date();

        const rows: LeadListItem[] = batch.map((l) => ({
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
              canCreate={canManage}
              loadMoreUrl="/api/mobile/list/leads"
              initialCursor={nextCursor}
              exportTitle="Leads"
              exportRows={rows as unknown as Record<string, unknown>[]}
              exportColumns={exportColumns}
              exportSummary={`${rows.length} leads · ${hotCount} hot · ${bookedCount} booked`}
              newLeadProjects={newLeadProjects as { id: string; name: string }[]}
              newLeadUnits={(newLeadUnits as { id: string; unitNumber: string; unitType: string; projectId: string; project: { name: string } }[]).map((u) => ({
                id: u.id,
                projectId: u.projectId,
                projectName: u.project.name,
                label: `${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`,
              }))}
              newLeadAssignees={(newLeadAssignees as { user: { id: string; name: string } }[]).map((a) => ({ id: a.user.id, name: a.user.name }))}
            />
          </div>
        );
      }}
    </MobileListPage>
  );
}
