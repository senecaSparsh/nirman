import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wallet } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import type { LeadRow } from "@/lib/types";
import { MobileSalesHub } from "./MobileSalesHub";

/**
 * /m/sales — Sales Collection page.
 *
 * Purpose: a salesperson opens this to collect money. The page is
 * organized around "what's owed to me" — not "list of all sales".
 *
 * The page answers three questions:
 *   1. How much is outstanding across all deals?  → Collection banner
 *   2. Which deals need payment right now?        → Outstanding cards (sorted by amount due)
 *   3. What's already been collected?             → Settled summary
 *
 * Each outstanding card has an inline "Record Payment" action.
 * A "New Sale" button is at the top for starting a new deal.
 */
export default function MobileSalesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Wallet className="size-5 animate-pulse" style={{ color: "var(--color-ink-300)" }} />
        </div>
      }
    >
      <SalesContent />
    </Suspense>
  );
}

async function SalesContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  const [sales, leads, projects, units, salesMembers] = await Promise.all([
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { saleDate: "desc" },
      take: 50,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        builtUnit: { select: { unitNumber: true, unitType: true, project: { select: { name: true } } } },
        project: { select: { name: true } },
        payments: { where: { status: "RECEIVED" }, select: { amount: true } },
      },
    }),
    prisma.lead.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
      include: {
        project: { select: { id: true, name: true } },
        interestedUnit: { select: { id: true, unitNumber: true } },
        assignedTo: { select: { id: true, name: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 1 },
        _count: { select: { activities: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.builtUnit.findMany({
      where: { deletedAt: null, status: { in: ["AVAILABLE", "HOLD"] }, project: { companyId: company.id, deletedAt: null } },
      orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
      select: { id: true, unitNumber: true, unitType: true, projectId: true, project: { select: { name: true } } },
    }),
    prisma.userCompany.findMany({
      where: { companyId: company.id, role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "SALES_MANAGER"] }, user: { active: true } },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const items = sales.map((s) => {
    const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const salePrice = toNum(s.salePrice);
    const balance = salePrice - totalPaid;
    const assetLabel = s.builtUnit
      ? `${s.builtUnit.unitNumber} · ${s.builtUnit.project.name}`
      : s.assetType === "LAND"
        ? `Land${s.project ? ` · ${s.project.name}` : ""}`
        : (s.project?.name ?? "Sale");
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customerName: s.customer.name,
      customerId: s.customer.id,
      customerPhone: s.customer.phone,
      assetLabel,
      saleDate: s.saleDate.toISOString(),
      salePrice,
      totalPaid,
      balance,
      paymentStatus: s.paymentStatus,
      saleStage: s.saleStage,
    };
  });

  const leadRows: LeadRow[] = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    priority: lead.priority,
    score: lead.score,
    budgetMin: lead.budgetMin == null ? null : toNum(lead.budgetMin),
    budgetMax: lead.budgetMax == null ? null : toNum(lead.budgetMax),
    interestedUnitType: lead.interestedUnitType,
    notes: lead.notes,
    projectId: lead.projectId,
    projectName: lead.project?.name ?? null,
    interestedUnitId: lead.interestedUnitId,
    interestedUnitLabel: lead.interestedUnit ? `Unit ${lead.interestedUnit.unitNumber}` : null,
    assignedToId: lead.assignedToId,
    assignedToName: lead.assignedTo?.name ?? null,
    convertedCustomerId: lead.convertedCustomerId,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    lostReason: lead.lostReason,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    activityCount: lead._count.activities,
    latestActivity: lead.activities[0] ? {
      type: lead.activities[0].type,
      note: lead.activities[0].note,
      outcome: lead.activities[0].outcome,
      occurredAt: lead.activities[0].occurredAt.toISOString(),
    } : null,
  }));

  // Aggregate stats
  const totalValue = items.reduce((s, x) => s + x.salePrice, 0);
  const totalCollected = items.reduce((s, x) => s + x.totalPaid, 0);
  const totalOutstanding = items.reduce((s, x) => s + x.balance, 0);
  const outstandingCount = items.filter((x) => x.balance > 0).length;
  const settledCount = items.filter((x) => x.balance <= 0).length;
  const collectionPct = totalValue > 0 ? Math.round((totalCollected / totalValue) * 100) : 0;

  return (
    <MobileSalesHub
      leads={leadRows}
      sales={items}
      stats={{ totalValue, totalCollected, totalOutstanding, outstandingCount, settledCount, collectionPct }}
      projects={projects}
      units={units.map((unit) => ({
        id: unit.id,
        projectId: unit.projectId,
        projectName: unit.project.name,
        label: `Unit ${unit.unitNumber} · ${unit.unitType.replaceAll("_", " ")}`,
      }))}
      assignees={salesMembers.map((membership) => membership.user)}
      canManage={hasPermission(role, PERM.SALES_MANAGE)}
    />
  );
}
