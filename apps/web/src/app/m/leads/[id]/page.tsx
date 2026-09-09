import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobilePipelineStepper, type MobilePipelineStep } from "@/components/mobile/v2/primitives";
import { MobileLeadDetailClient } from "./MobileLeadDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

/**
 * /m/leads/[id] — lead detail.
 *
 * Purpose: a salesperson/manager opens this to see who the lead is,
 * where they are in the pipeline, their budget, and the activity
 * timeline — then take action: call, email, or convert to customer.
 */
export default function MobileLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params}>
      {async ({ id, company, role }) => {
        const canCreate = hasPermission(role, PERM.SALE_CREATE);
        const canManage = hasPermission(role, PERM.SALES_MANAGE);

        const lead = await prisma.lead.findFirst({
          where: {...await scopeWhere("Lead"),  id, companyId: company.id, deletedAt: null },
          include: {
            project: { select: { id: true, name: true } },
            interestedUnit: { select: { id: true, unitNumber: true } },
            assignedTo: { select: { id: true, name: true } },
            convertedCustomer: { select: { id: true, name: true } },
            activities: {
              orderBy: { occurredAt: "desc" },
              take: 20,
            },
          },
        });

        if (!lead) {
          return (
            <MobileLeadDetailClient notFound canCreate={canCreate} canManage={canManage} />
          );
        }

        const now = new Date();
        const lastContactAt = lead.lastContactAt;
        const daysSinceContact = lastContactAt
          ? Math.floor((now.getTime() - lastContactAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const data = {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email ?? null,
          source: lead.source,
          stage: lead.stage,
          priority: lead.priority,
          score: lead.score,
          budgetMin: lead.budgetMin ? toNum(lead.budgetMin) : null,
          budgetMax: lead.budgetMax ? toNum(lead.budgetMax) : null,
          interestedUnitType: lead.interestedUnitType ?? null,
          interestedUnitNumber: lead.interestedUnit?.unitNumber ?? null,
          projectName: lead.project?.name ?? null,
          projectId: lead.project?.id ?? null,
          assignedToName: lead.assignedTo?.name ?? null,
          notes: lead.notes ?? null,
          nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString() : null,
          lastContactAt: lead.lastContactAt ? lead.lastContactAt.toISOString() : null,
          lostReason: lead.lostReason ?? null,
          convertedAt: lead.convertedAt ? lead.convertedAt.toISOString() : null,
          convertedCustomerId: lead.convertedCustomer?.id ?? null,
          convertedCustomerName: lead.convertedCustomer?.name ?? null,
          createdAt: lead.createdAt.toISOString(),
          activities: lead.activities.map((a) => ({
            id: a.id,
            type: a.type,
            note: a.note ?? null,
            outcome: a.outcome ?? null,
            occurredAt: a.occurredAt.toISOString(),
            nextFollowUpAt: a.nextFollowUpAt ? a.nextFollowUpAt.toISOString() : null,
          })),
          stats: {
            score: lead.score,
            activityCount: lead.activities.length,
            daysSinceContact,
          },
        };

        // Lifecycle pipeline: NEW → CONTACTED → SITE_VISIT → NEGOTIATION → BOOKED (or LOST)
        const leadStages = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKED"];
        const stageIdx = leadStages.indexOf(lead.stage);
        const isLost = lead.stage === "LOST";
        const leadPipelineSteps: MobilePipelineStep[] = leadStages.map((s, i) => ({
          label: s.charAt(0) + s.slice(1).toLowerCase().replace("_", " "),
          state: isLost ? (i === 0 ? "done" : "skipped") : i < stageIdx ? "done" : i === stageIdx ? "current" : "pending",
        }));
        if (isLost) leadPipelineSteps.push({ label: "Lost", state: "current" });

        return (
          <PageContextProvider value={{
            entityType: "lead",
            status: lead.stage,
            label: lead.name,
            subtitle: lead.project?.name ?? lead.phone ?? undefined,
            recordId: lead.id,
          }}>
          <>
            <div className="mb-3 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <MobilePipelineStepper steps={leadPipelineSteps} />
            </div>
            <MobileLeadDetailClient
              data={data}
              canCreate={canCreate}
              canManage={canManage}
            />
          </>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
