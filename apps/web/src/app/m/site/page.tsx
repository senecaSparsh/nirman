import { Suspense } from "react";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Home,
  Package,
  ScanLine,
  CheckSquare,
  CalendarCheck,
  ClipboardList,
  ArrowRight,
  Truck,
} from "lucide-react";
import { getCompany, getCurrentUser } from "@/lib/server";
import { formatNumber, formatDate } from "@/lib/utils";
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
import { MobileAttentionBanner, type AttentionItem } from "@/components/mobile/mobile-attention-banner";

/**
 * Field persona home — "Site".
 * SUPERVISOR. On-site, phone-in-hand: DPR, attendance, stock, receive, tasks.
 * This is the heaviest mobile persona — capture, don't browse.
 */
export default function SitePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <SiteContent />
    </Suspense>
  );
}

async function SiteContent() {
  await connection();
  const company = await getCompany();
  const user = await getCurrentUser();

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [myTasks, myDprToday, recentIssues, inTransitPOs, attendanceToday, projects] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToId: user?.id ?? "none", status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 6,
      select: { id: true, title: true, status: true, priority: true, dueDate: true },
    }),
    prisma.dailyProgressReport.findFirst({
      where: { project: { companyId: company.id }, date: { gte: startOfToday, lt: endOfToday }, submittedById: user?.id },
      select: { id: true, date: true },
    }),
    prisma.materialIssue.findMany({
      where: { project: { companyId: company.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { project: { select: { name: true } }, fromLocation: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
      orderBy: { expectedDate: "asc" },
      take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.workerAttendance.count({
      where: { employee: { companyId: company.id }, date: { gte: startOfToday, lt: endOfToday }, checkIn: { not: null } },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true },
      take: 5,
    }),
  ]);

  // ── Smart attention items: what needs acting on TODAY ──────
  const attentionItems: AttentionItem[] = [];

  // 1. Missing DPR (highest priority — daily compliance)
  if (!myDprToday) {
    attentionItems.push({
      title: "Today's DPR not submitted",
      subtitle: "Tap to fill in your daily progress report",
      meta: "due now",
      href: "/m/site/dpr",
    });
  }

  // 2. Overdue tasks (due date passed, not completed)
  const overdueTasks = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < startOfToday);
  if (overdueTasks.length > 0) {
    attentionItems.push({
      title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`,
      subtitle: overdueTasks[0]!.title,
      meta: "overdue",
      href: "/m/site/tasks",
    });
  }

  // 3. Overdue POs (expected date passed, not received)
  const overduePOs = inTransitPOs.filter((p) => p.expectedDate && new Date(p.expectedDate) < startOfToday);
  if (overduePOs.length > 0) {
    attentionItems.push({
      title: `${overduePOs.length} PO${overduePOs.length > 1 ? "s" : ""} overdue for receipt`,
      subtitle: `${overduePOs[0]!.supplier.name} · PO ${overduePOs[0]!.poNumber}`,
      meta: "overdue",
      href: `/m/site/field?po=${overduePOs[0]!.id}`,
    });
  }

  return (
    <div>
      <MobilePageHeader title="Site" subtitle={formatDate(today)} right={<MobileRefreshButton />} />

      {/* ── Smart attention banner ───────────────────────────
          Surfaces what's urgent TODAY: overdue POs, overdue tasks,
          missing DPR. Collapses into one row + expand. */}
      <MobileAttentionBanner items={attentionItems} />

      {/* ── Today's quick stats ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="My Tasks" value={formatNumber(myTasks.length, 0)} hint="open" icon={CheckSquare} tone={myTasks.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Checked In" value={formatNumber(attendanceToday, 0)} hint="today" icon={CalendarCheck} />
        <MobileStatCard label="In Transit" value={formatNumber(inTransitPOs.length, 0)} hint="POs to receive" icon={Truck} />
        <MobileStatCard label="Today&apos;s DPR" value={myDprToday ? "Submitted" : "Pending"} icon={ClipboardList} tone={myDprToday ? "success" : "warning"} />
      </div>

      {/* ── Primary action ────────────────────────────────── */}
      <div className="px-4 pb-1">
        <MobileCta href="/m/site/field" icon={ScanLine}>
          Receive materials (scan)
        </MobileCta>
      </div>

      {/* ── Today's DPR ───────────────────────────────────── */}
      <MobileSectionTitle>Daily Progress Report</MobileSectionTitle>
      {myDprToday ? (
        <MobileRow href="/m/site/dpr" icon={ClipboardList} title="DPR submitted" subtitle={formatDate(myDprToday.date)} meta="edit" tone="success" />
      ) : (
        <MobileRow href="/m/site/dpr" icon={ClipboardList} title="Today's DPR pending" subtitle="Tap to submit your daily progress report" meta="due" tone="warning" />
      )}

      {/* ── My tasks ──────────────────────────────────────── */}
      <MobileSectionTitle>My Tasks</MobileSectionTitle>
      {myTasks.length === 0 ? (
        <MobileEmptyState icon={CheckSquare} title="No open tasks" hint="New assignments appear here" />
      ) : (
        <div>
          {myTasks.map((t) => (
            <MobileInfoRow key={t.id} icon={CheckSquare} title={t.title} subtitle={t.priority} value="" badge={<MobileStatusBadge status={t.status} />} />
          ))}
        </div>
      )}

      {/* ── In-transit POs to receive ─────────────────────── */}
      <MobileSectionTitle>Awaiting Receipt</MobileSectionTitle>
      {inTransitPOs.length === 0 ? (
        <MobileEmptyState icon={Truck} title="Nothing in transit" />
      ) : (
        <div>
          {inTransitPOs.map((po) => (
            <MobileRow key={po.id} href={`/m/site/field?po=${po.id}`} icon={Truck} title={po.supplier.name} subtitle={`PO ${po.poNumber} · ${formatDate(po.expectedDate)}`} badge={<MobileStatusBadge status={po.status} />} />
          ))}
        </div>
      )}

      {/* ── Recent material issues ────────────────────────── */}
      <MobileSectionTitle>Recent Issues</MobileSectionTitle>
      {recentIssues.length === 0 ? (
        <MobileEmptyState icon={Package} title="No recent material issues" />
      ) : (
        <div>
          {recentIssues.map((i) => (
            <MobileInfoRow key={i.id} icon={ArrowRight} title={i.project?.name ?? "—"} subtitle={`From ${i.fromLocation?.name ?? "—"}`} value={formatDate(i.createdAt)} />
          ))}
        </div>
      )}

      {/* ── My projects ───────────────────────────────────── */}
      <MobileSectionTitle>My Projects</MobileSectionTitle>
      {projects.length === 0 ? (
        <MobileEmptyState icon={Home} title="No active projects" />
      ) : (
        <div>
          {projects.map((p) => (
            <MobileRow key={p.id} href={`/m/projects/${p.id}`} icon={Home} title={p.name} />
          ))}
        </div>
      )}
    </div>
  );
}
