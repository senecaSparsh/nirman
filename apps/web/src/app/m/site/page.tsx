import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Package, CalendarCheck,
  ClipboardList, Truck, Recycle, ListTodo,
} from "lucide-react";
import { getCompany, getCurrentUser } from "@/lib/server";
import { formatDate } from "@/lib/utils";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";

/**
 * Field persona home — "Site".
 * SUPERVISOR. On-site, phone-in-hand: DPR, attendance, stock, receive, tasks.
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
      include: {
        project: { select: { name: true } },
        fromLocation: { select: { name: true } },
        lines: { select: { id: true, qty: true } },
      },
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
      select: { id: true, name: true, status: true },
      take: 5,
    }),
  ]);

  // ── Attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  if (!myDprToday) {
    attentionBanners.push({
      id: "dpr",
      title: "Today's Daily Progress Report not submitted",
      subtitle: "Fill in your daily progress report",
      href: "/m/site/dpr",
      severity: "low",
      qtyText: "Due",
      category: "Daily Progress Report",
    });
  }

  const overdueTasks = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < startOfToday);
  if (overdueTasks.length > 0) {
    attentionBanners.push({
      id: "overdue-tasks",
      title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`,
      subtitle: overdueTasks[0]?.title ?? "View tasks",
      href: "/m/site/tasks",
      severity: "out",
      qtyText: String(overdueTasks.length),
      category: "Tasks",
    });
  }

  const overduePOs = inTransitPOs.filter((p) => p.expectedDate && new Date(p.expectedDate) < startOfToday);
  if (overduePOs.length > 0) {
    attentionBanners.push({
      id: "overdue-pos",
      title: `${overduePOs.length} PO${overduePOs.length > 1 ? "s" : ""} overdue for receipt`,
      subtitle: `${overduePOs[0]!.supplier.name} · ${overduePOs[0]!.poNumber}`,
      href: `/m/site/receive?po=${overduePOs[0]!.id}`,
      severity: "out",
      qtyText: String(overduePOs.length),
      category: "Receipts",
    });
  }

  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `${myTasks.length} open task${myTasks.length !== 1 ? "s" : ""} · ${inTransitPOs.length} in transit · Daily Progress Report ${myDprToday ? "submitted" : "pending"}`,
      href: "/m/site",
      severity: "clear",
      qtyText: "✓",
      category: "Today",
    });
  }

  const dprDone = !!myDprToday;

  return (
    <div className="space-y-3">
      {/* ── Attention banner ── */}
      <AttentionBannerCarousel banners={attentionBanners} />

      {/* ── Quick actions — 6-col single row with live context badges ── */}
      <div className="grid grid-cols-6 gap-1.5">
        <ActionCard href="/m/site/issue" icon={Package} label="Quick Issue" sub="Material challan" />
        <ActionCard href="/m/site/receive" icon={Truck} label="Receive Stock" sub="Scan PO / gate entry" badge={inTransitPOs.length > 0 ? String(inTransitPOs.length) : undefined} badgeTone={overduePOs.length > 0 ? "stop" : "steel"} />
        <ActionCard href="/m/site/dpr" icon={ClipboardList} label="Submit Daily Progress Report" sub="Progress & variance" badge={dprDone ? "Done" : "Due"} badgeTone={dprDone ? "go" : "signal"} />
        <ActionCard href="/m/site/attendance" icon={CalendarCheck} label="Attendance" sub="GPS tagged" badge={attendanceToday > 0 ? String(attendanceToday) : undefined} badgeTone="steel" />
        <ActionCard href="/m/scrap-generations" icon={Recycle} label="Scrap Log" sub="Log scrap generation" />
        <ActionCard href="/m/site/tasks" icon={ListTodo} label="Open Tasks" sub="Site punch list" badge={myTasks.length > 0 ? String(myTasks.length) : undefined} badgeTone={overdueTasks.length > 0 ? "stop" : "steel"} />
      </div>

      {/* ── Open Tasks + Awaiting Receipt — 2-col side by side ── */}
      <div className="grid grid-cols-2 gap-2 items-start">
        {/* Tasks column — shows due date + overdue days */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            Tasks ({myTasks.length})
          </h3>
          {myTasks.length === 0 ? (
            <EmptyCol text="No open tasks" />
          ) : (
            myTasks.slice(0, 5).map((t) => {
              const taskTone =
                t.status === "BLOCKED" ? "var(--color-stop)" :
                t.status === "IN_PROGRESS" ? "var(--color-signal)" :
                "var(--color-ink-500)";
              const isOverdue = t.dueDate && new Date(t.dueDate) < startOfToday;
              const overdueDays = isOverdue && t.dueDate
                ? Math.floor((startOfToday.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              return (
                <Link
                  key={t.id}
                  href="/m/site/tasks"
                  className="flex flex-col rounded-[0.5rem] border p-2 press overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: isOverdue ? "var(--color-stop)" : taskTone }} />
                  <p className="text-[0.5625rem] font-bold leading-tight truncate mb-1" style={{ color: "var(--color-ink-950)" }}>
                    {t.title}
                  </p>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[0.4375rem] uppercase font-semibold" style={{ color: taskTone }}>
                      {t.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                    {isOverdue ? (
                      <span className="text-[0.4375rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
                        {overdueDays}d overdue
                      </span>
                    ) : t.dueDate ? (
                      <span className="text-[0.4375rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                        due {formatDate(t.dueDate)}
                      </span>
                    ) : (
                      <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
                        {t.priority}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Awaiting receipt column — shows days until/overdue delivery */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            In Transit ({inTransitPOs.length})
          </h3>
          {inTransitPOs.length === 0 ? (
            <EmptyCol text="Nothing in transit" />
          ) : (
            inTransitPOs.slice(0, 5).map((po) => {
              const isOverdue = po.expectedDate && new Date(po.expectedDate) < startOfToday;
              const overdueDays = isOverdue && po.expectedDate
                ? Math.floor((startOfToday.getTime() - new Date(po.expectedDate).getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              const daysUntil = !isOverdue && po.expectedDate
                ? Math.ceil((new Date(po.expectedDate).getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              const poTone = isOverdue ? "var(--color-stop)" : po.status === "PARTIAL" ? "var(--color-signal)" : "var(--color-steel)";
              return (
                <Link
                  key={po.id}
                  href={`/m/site/receive?po=${po.id}`}
                  className="flex flex-col rounded-[0.5rem] border p-2 press overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: poTone }} />
                  <p className="text-[0.5625rem] font-bold leading-tight truncate mb-1" style={{ color: "var(--color-ink-950)" }}>
                    {po.supplier.name}
                  </p>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[0.4375rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
                      {po.poNumber}
                    </span>
                    {isOverdue ? (
                      <span className="text-[0.4375rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
                        {overdueDays}d late
                      </span>
                    ) : daysUntil === 0 ? (
                      <span className="text-[0.4375rem] font-bold" style={{ color: "var(--color-signal)" }}>
                        today
                      </span>
                    ) : daysUntil === 1 ? (
                      <span className="text-[0.4375rem] font-bold" style={{ color: "var(--color-signal)" }}>
                        tomorrow
                      </span>
                    ) : (
                      <span className="text-[0.4375rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                        {daysUntil}d
                      </span>
                    )}
                  </div>
                  {po.status === "PARTIAL" ? (
                    <span className="text-[0.375rem] mt-0.5 uppercase font-semibold" style={{ color: "var(--color-signal)" }}>
                      Partially received
                    </span>
                  ) : null}
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* ── Recent Issues + My Projects — 2-col side by side ── */}
      <div className="grid grid-cols-2 gap-2 items-start">
        {/* Recent issues column — shows issue number + line count + total */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            Recent Issues ({recentIssues.length})
          </h3>
          {recentIssues.length === 0 ? (
            <EmptyCol text="No recent issues" />
          ) : (
            recentIssues.slice(0, 5).map((i) => (
              <div
                key={i.id}
                className="flex flex-col rounded-[0.5rem] border p-2 overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: "var(--color-steel)" }} />
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[0.4375rem] font-mono font-bold" style={{ color: "var(--color-steel)" }}>
                    {i.issueNumber ?? "—"}
                  </span>
                  <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
                    {formatDate(i.issueDate)}
                  </span>
                </div>
                <p className="text-[0.5625rem] font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                  {i.project?.name ?? "—"}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                    {i.lines.length} line{i.lines.length !== 1 ? "s" : ""} · {i.fromLocation?.name ?? "—"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* My projects column — shows status badge */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            My Projects ({projects.length})
          </h3>
          {projects.length === 0 ? (
            <EmptyCol text="No active projects" />
          ) : (
            projects.map((p) => {
              const projTone = p.status === "ACTIVE" ? "var(--color-go)" : "var(--color-signal)";
              return (
                <Link
                  key={p.id}
                  href={`/m/projects/${p.id}`}
                  className="flex flex-col rounded-[0.5rem] border p-2 press overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: projTone }} />
                  <p className="text-[0.5625rem] font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                    {p.name}
                  </p>
                  <span className="text-[0.375rem] uppercase font-semibold" style={{ color: projTone }}>
                    {p.status === "ACTIVE" ? "Active" : "Planned"}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Action card — compact for 6-col row ─── */
function ActionCard({
  href,
  icon: Icon,
  label,
  sub: _sub,
  badge,
  badgeTone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  sub: string;
  badge?: string;
  badgeTone?: "go" | "signal" | "stop" | "steel";
}) {
  const badgeColor =
    badgeTone === "go" ? "var(--color-go)" :
    badgeTone === "signal" ? "var(--color-signal)" :
    badgeTone === "stop" ? "var(--color-stop)" :
    "var(--color-steel)";
  return (
    <Link
      href={href}
      className="flex flex-col items-center rounded-[0.5rem] border p-1.5 press overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="relative mb-1">
        <span
          className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Icon className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
        </span>
        {badge ? (
          <span
            className="absolute -top-1 -right-1.5 text-[0.4375rem] font-bold tabular-nums px-1 py-0 rounded-full leading-none min-w-[1rem] text-center"
            style={{ backgroundColor: badgeColor, color: "#fff" }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-[0.4375rem] font-bold leading-tight text-center" style={{ color: "var(--color-ink-950)" }}>
        {label}
      </p>
    </Link>
  );
}

/* ─── Empty column placeholder ─── */
function EmptyCol({ text }: { text: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-[0.5rem] border p-2 text-center"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", minHeight: "3rem" }}
    >
      <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
        {text}
      </p>
    </div>
  );
}
