import { Suspense } from "react";
import Link from "next/link";
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
  Recycle,
  ListTodo,
  Boxes,
  ArrowUpRight,
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
 * Refined layout matching IMG_0871, IMG_0872, IMG_0873 architecture.
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

  // 2. Overdue tasks
  const overdueTasks = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < startOfToday);
  if (overdueTasks.length > 0) {
    attentionItems.push({
      title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`,
      subtitle: overdueTasks[0]!.title,
      meta: "overdue",
      href: "/m/site/tasks",
    });
  }

  // 3. Overdue POs
  const overduePOs = inTransitPOs.filter((p) => p.expectedDate && new Date(p.expectedDate) < startOfToday);
  if (overduePOs.length > 0) {
    attentionItems.push({
      title: `${overduePOs.length} PO${overduePOs.length > 1 ? "s" : ""} overdue for receipt`,
      subtitle: `${overduePOs[0]!.supplier.name} · PO ${overduePOs[0]!.poNumber}`,
      meta: "overdue",
      href: `/m/site/receive?po=${overduePOs[0]!.id}`,
    });
  }

  return (
    <div className="space-y-4 pb-6">
      <MobilePageHeader title="Site Command" subtitle={formatDate(today)} right={<MobileRefreshButton />} />

      {/* ── Smart attention banner ─────────────────────────── */}
      <MobileAttentionBanner items={attentionItems} />

      {/* ── Action Grid (IMG_0871 & IMG_0873 Architecture) ───── */}
      <div className="px-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Quick Field Actions
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Quick Issue */}
          <Link
            href="/m/site/issue"
            className="flex flex-col justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 transition-all active:scale-95 hover:bg-amber-500/10 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Package className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="block text-sm font-bold text-foreground">Quick Issue</span>
              <span className="block text-[11px] text-muted-foreground">Material Issue Challan</span>
            </div>
          </Link>

          {/* Receive Stock */}
          <Link
            href="/m/site/receive"
            className="flex flex-col justify-between rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 transition-all active:scale-95 hover:bg-blue-500/10 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400">
                <Truck className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="block text-sm font-bold text-foreground">Receive Stock</span>
              <span className="block text-[11px] text-muted-foreground">Scan PO / Gate Entry</span>
            </div>
          </Link>

          {/* DPR Submission */}
          <Link
            href="/m/site/dpr"
            className="flex flex-col justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 transition-all active:scale-95 hover:bg-emerald-500/10 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <ClipboardList className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="block text-sm font-bold text-foreground">Submit DPR</span>
              <span className="block text-[11px] text-muted-foreground">Progress &amp; Variance</span>
            </div>
          </Link>

          {/* Site Attendance */}
          <Link
            href="/m/site/attendance"
            className="flex flex-col justify-between rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5 transition-all active:scale-95 hover:bg-purple-500/10 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400">
                <CalendarCheck className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="block text-sm font-bold text-foreground">Site Attendance</span>
              <span className="block text-[11px] text-muted-foreground">GPS Tagged Attendance</span>
            </div>
          </Link>

          {/* Scrap Log */}
          <Link
            href="/m/scrap-generations"
            className="flex flex-col justify-between rounded-xl border border-orange-500/20 bg-orange-500/5 p-3.5 transition-all active:scale-95 hover:bg-orange-500/10 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-orange-500/20 text-orange-600 dark:text-orange-400">
                <Recycle className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="block text-sm font-bold text-foreground">Scrap Log</span>
              <span className="block text-[11px] text-muted-foreground">Log Scrap Generation</span>
            </div>
          </Link>

          {/* Open Tasks */}
          <Link
            href="/m/site/tasks"
            className="flex flex-col justify-between rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5 transition-all active:scale-95 hover:bg-cyan-500/10 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                <ListTodo className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="block text-sm font-bold text-foreground">Open Tasks</span>
              <span className="block text-[11px] text-muted-foreground">Site Punch List</span>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Today's KPI Stats ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 px-3">
        <MobileStatCard label="My Tasks" value={formatNumber(myTasks.length, 0)} hint="open" icon={CheckSquare} tone={myTasks.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Checked In" value={formatNumber(attendanceToday, 0)} hint="workers today" icon={CalendarCheck} />
        <MobileStatCard label="In Transit" value={formatNumber(inTransitPOs.length, 0)} hint="POs to receive" icon={Truck} />
        <MobileStatCard label="Today's DPR" value={myDprToday ? "Submitted" : "Pending"} icon={ClipboardList} tone={myDprToday ? "success" : "warning"} />
      </div>

      {/* ── Today's DPR Card ───────────────────────────────── */}
      <div>
        <MobileSectionTitle>Daily Progress Report</MobileSectionTitle>
        {myDprToday ? (
          <MobileRow href="/m/site/dpr" icon={ClipboardList} title="DPR submitted" subtitle={formatDate(myDprToday.date)} meta="edit" tone="success" />
        ) : (
          <MobileRow href="/m/site/dpr" icon={ClipboardList} title="Today's DPR pending" subtitle="Tap to submit your daily progress report" meta="due" tone="warning" />
        )}
      </div>

      {/* ── My Open Tasks ──────────────────────────────────── */}
      <div>
        <MobileSectionTitle>Open Site Tasks</MobileSectionTitle>
        {myTasks.length === 0 ? (
          <MobileEmptyState icon={CheckSquare} title="No open tasks" hint="New assignments appear here" />
        ) : (
          <div>
            {myTasks.map((t) => (
              <MobileInfoRow key={t.id} icon={CheckSquare} title={t.title} subtitle={t.priority} value="" badge={<MobileStatusBadge status={t.status} />} />
            ))}
          </div>
        )}
      </div>

      {/* ── In-transit POs to receive ─────────────────────── */}
      <div>
        <MobileSectionTitle>Awaiting Receipt</MobileSectionTitle>
        {inTransitPOs.length === 0 ? (
          <MobileEmptyState icon={Truck} title="Nothing in transit" />
        ) : (
          <div>
            {inTransitPOs.map((po) => (
              <MobileRow key={po.id} href={`/m/site/receive?po=${po.id}`} icon={Truck} title={po.supplier.name} subtitle={`PO ${po.poNumber} · ${formatDate(po.expectedDate)}`} badge={<MobileStatusBadge status={po.status} />} />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Material Issues ────────────────────────── */}
      <div>
        <MobileSectionTitle>Recent Material Issues</MobileSectionTitle>
        {recentIssues.length === 0 ? (
          <MobileEmptyState icon={Package} title="No recent material issues" />
        ) : (
          <div>
            {recentIssues.map((i) => (
              <MobileInfoRow key={i.id} icon={ArrowRight} title={i.project?.name ?? "—"} subtitle={`From ${i.fromLocation?.name ?? "—"}`} value={formatDate(i.createdAt)} />
            ))}
          </div>
        )}
      </div>

      {/* ── My Active Projects ───────────────────────────── */}
      <div>
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
    </div>
  );
}

