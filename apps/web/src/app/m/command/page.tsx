import { Suspense } from "react";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { materialInventoryValue } from "@nirman/services";
import {
  ClipboardList,
  Truck,
  Package,
  Building2,
  Users,
  AlertTriangle,
  ClipboardCheck,
  CheckSquare,
} from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileInfoRow,
  MobileEmptyState,
  MobileCta,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";

/**
 * Operations persona home — "Command Center".
 * MANAGER. Live queues + alerts to keep every site unblocked.
 */
export default function CommandPage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <CommandContent />
    </Suspense>
  );
}

async function CommandContent() {
  await connection();
  const company = await getCompany();

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [inventoryVal, draftPOs, pendingReqs, overduePOs, lowStockItems, openTasks, dprsToday, activeProjects] = await Promise.all([
    materialInventoryValue(company.id),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { project: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
      orderBy: { expectedDate: "asc" },
      take: 6,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, minStock: { not: null } },
      select: { id: true, code: true, name: true, unit: true, minStock: true, stockItems: { where: { location: { companyId: company.id } }, select: { qty: true } } },
    }),
    prisma.task.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, status: true, priority: true, assignedTo: { select: { name: true } } },
    }),
    prisma.dailyProgressReport.findMany({
      where: { project: { companyId: company.id }, date: { gte: startOfToday, lt: endOfToday } },
      select: { id: true },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
  ]);

  const lowStock = lowStockItems
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const minStock = toNum(m.minStock);
      return { id: m.id, name: m.name, unit: m.unit, totalQty, minStock, shortfall: minStock - totalQty };
    })
    .filter((m) => m.totalQty < m.minStock)
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 6);

  const actionCount = draftPOs.length + pendingReqs.length + overduePOs.length + lowStock.length;

  return (
    <div>
      <MobilePageHeader
        title="Command"
        subtitle={`${actionCount} actions needed${dprsToday.length === 0 ? " · no DPRs today" : ` · ${dprsToday.length} DPRs today`}`}
        right={<MobileRefreshButton />}
      />

      {/* ── Quick stats ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Inventory Value" value={formatCurrency(toNum(inventoryVal))} icon={Package} />
        <MobileStatCard label="Open Tasks" value={formatNumber(openTasks.length, 0)} icon={CheckSquare} />
        <MobileStatCard label="Draft POs" value={formatNumber(draftPOs.length, 0)} icon={Truck} tone={draftPOs.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Low Stock" value={formatNumber(lowStock.length, 0)} icon={AlertTriangle} tone={lowStock.length > 0 ? "danger" : "default"} />
      </div>

      <div className="px-4">
        <MobileCta href="/m/command/approvals" icon={ClipboardCheck}>
          Approvals queue · {draftPOs.length + pendingReqs.length}
        </MobileCta>
      </div>

      {/* ── Overdue POs ───────────────────────────────────── */}
      {overduePOs.length > 0 && (
        <>
          <MobileSectionTitle>Overdue POs</MobileSectionTitle>
          <div>
            {overduePOs.map((po) => (
              <MobileRow key={po.id} href={`/m/procurement/${po.id}`} icon={AlertTriangle} title={po.supplier.name} subtitle={`PO ${po.poNumber} · ${formatDate(po.expectedDate)}`} meta="overdue" tone="danger" />
            ))}
          </div>
        </>
      )}

      {/* ── Low stock ─────────────────────────────────────── */}
      <MobileSectionTitle>Low Stock</MobileSectionTitle>
      {lowStock.length === 0 ? (
        <MobileEmptyState icon={Package} title="All materials above min stock" />
      ) : (
        <div>
          {lowStock.map((m) => (
            <MobileRow key={m.id} href={`/m/materials/${m.id}`} icon={Package} title={m.name} subtitle={`Min ${formatNumber(m.minStock, 0)} ${m.unit}`} meta={`${formatNumber(m.totalQty, 0)} ${m.unit}`} tone="danger" />
          ))}
        </div>
      )}

      {/* ── Requisitions awaiting approval ────────────────── */}
      <MobileSectionTitle>Requisitions</MobileSectionTitle>
      {pendingReqs.length === 0 ? (
        <MobileEmptyState icon={ClipboardList} title="No requisitions awaiting approval" />
      ) : (
        <div>
          {pendingReqs.map((r) => (
            <MobileRow key={r.id} href={`/m/requisitions/${r.id}`} icon={ClipboardList} title={r.project.name} subtitle={`Submitted ${formatDate(r.createdAt)}`} badge={<MobileStatusBadge status={r.status} />} />
          ))}
        </div>
      )}

      {/* ── Open tasks ────────────────────────────────────── */}
      <MobileSectionTitle>Open Tasks</MobileSectionTitle>
      {openTasks.length === 0 ? (
        <MobileEmptyState icon={CheckSquare} title="No open tasks" />
      ) : (
        <div>
          {openTasks.map((t) => (
            <MobileInfoRow key={t.id} icon={CheckSquare} title={t.title} subtitle={t.assignedTo?.name ?? "Unassigned"} value="" badge={<MobileStatusBadge status={t.status} />} />
          ))}
        </div>
      )}

      {/* ── Active projects ───────────────────────────────── */}
      <MobileSectionTitle>Active Projects</MobileSectionTitle>
      {activeProjects.length === 0 ? (
        <MobileEmptyState icon={Building2} title="No active projects" />
      ) : (
        <div>
          {activeProjects.map((p) => (
            <MobileRow key={p.id} href={`/m/projects/${p.id}`} icon={Building2} title={p.name} badge={<MobileStatusBadge status={p.status} />} />
          ))}
        </div>
      )}

      <div className="px-4 pb-4 pt-2">
        <MobileCta href="/m/command/people" icon={Users} variant="outline">
          Workforce
        </MobileCta>
      </div>
    </div>
  );
}
