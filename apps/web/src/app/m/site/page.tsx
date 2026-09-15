import Link from "next/link";
import { prisma } from "@nirman/db";
import { getCurrentUser, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { loadQuickActionContext } from "@/lib/quick-action-server";
import { formatDate } from "@/lib/utils";
import { ClipboardCheck, Truck, Package, Building2 } from "lucide-react";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { SiteInteractive } from "./site-interactive";

/**
 * Field persona home — "Site".
 * SUPERVISOR. On-site, phone-in-hand: DPR, attendance, stock, receive, tasks.
 */
export default function SitePage() {
  return (
    <MobileHubPage perm={PERM.TASKS_VIEW} what="site" permission="tasks.view">
      {async ({ company }) => {
        const user = await getCurrentUser();

        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

        const [myTasks, myDprToday, recentIssues, inTransitPOs, projects, qaCtx] = await Promise.all([
          prisma.task.findMany({
            where: {...await scopeWhere("Task"),  assignedToId: user?.id ?? "none", status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] } },
            orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
            take: 6,
            select: { id: true, title: true, status: true, priority: true, dueDate: true },
          }),
          prisma.dailyProgressReport.findFirst({
            where: {...await scopeWhere("DailyProgressReport"),  project: { companyId: company.id }, date: { gte: startOfToday, lt: endOfToday }, submittedById: user?.id },
            select: { id: true, date: true },
          }),
          prisma.materialIssue.findMany({
            where: {...await scopeWhere("MaterialIssue"),  project: { companyId: company.id }, status: { not: "CANCELLED" } },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              project: { select: { name: true } },
              fromLocation: { select: { name: true } },
              lines: { select: { id: true, qty: true } },
            },
          }),
          prisma.purchaseOrder.findMany({
            where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, ...await scopeWhere("PurchaseOrder") },
            orderBy: { expectedDate: "asc" },
            take: 5,
            include: { supplier: { select: { name: true } } },
          }),
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] }, ...await scopeWhere("Project") },
            select: { id: true, name: true, status: true },
            take: 5,
          }),
          loadQuickActionContext("site"),
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

        return (
          <div className="space-y-3">
            {/* ── Attention banner ── */}
            <AttentionBannerCarousel banners={attentionBanners} />

            {/* ── Quick actions — editable, drag-to-reorder (same as inventory) ── */}
            <SiteInteractive persona={qaCtx.persona} savedLayouts={qaCtx.savedLayouts} extraActions={qaCtx.extraActions} />

            {/* ── My Tasks — dense rows, overdue first ── */}
            <MobileSectionTitle
              right={
                myTasks.length > 0 ? (
                  <Link
                    href="/m/site/tasks"
                    className="text-m-label font-semibold text-m-body press"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    View all
                  </Link>
                ) : undefined
              }
            >
              My tasks {myTasks.length > 0 ? `(${myTasks.length})` : ""}
            </MobileSectionTitle>
            {myTasks.length === 0 ? (
              <MobileEmptyState size="compact" icon={ClipboardCheck} title="No open tasks" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {myTasks.slice(0, 5).map((t) => {
                  const isOverdue = t.dueDate && new Date(t.dueDate) < startOfToday;
                  const overdueDays = isOverdue && t.dueDate
                    ? Math.floor((startOfToday.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  return (
                    <MobileRow
                      key={t.id}
                      href="/m/site/tasks"
                      icon={ClipboardCheck}
                      title={t.title}
                      subtitle={t.status.replace(/_/g, " ").toLowerCase()}
                      meta={
                        isOverdue
                          ? `${overdueDays}d late`
                          : t.dueDate
                            ? formatDate(t.dueDate)
                            : t.priority
                      }
                      tone={isOverdue ? "danger" : t.status === "IN_PROGRESS" ? "warning" : "default"}
                    />
                  );
                })}
              </div>
            )}

            {/* ── In Transit — POs on their way to site ── */}
            <MobileSectionTitle
              right={
                inTransitPOs.length > 0 ? (
                  <Link
                    href="/m/site/receive"
                    className="text-m-label font-semibold text-m-body press"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    View all
                  </Link>
                ) : undefined
              }
            >
              In transit {inTransitPOs.length > 0 ? `(${inTransitPOs.length})` : ""}
            </MobileSectionTitle>
            {inTransitPOs.length === 0 ? (
              <MobileEmptyState size="compact" icon={Truck} title="Nothing in transit" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {inTransitPOs.slice(0, 5).map((po) => {
                  const isOverdue = po.expectedDate && new Date(po.expectedDate) < startOfToday;
                  const overdueDays = isOverdue && po.expectedDate
                    ? Math.floor((startOfToday.getTime() - new Date(po.expectedDate).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const daysUntil = !isOverdue && po.expectedDate
                    ? Math.ceil((new Date(po.expectedDate).getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const meta = isOverdue
                    ? `${overdueDays}d late`
                    : !po.expectedDate
                      ? "no date"
                      : daysUntil === 0
                        ? "today"
                        : daysUntil === 1
                          ? "tomorrow"
                          : `${daysUntil}d`;
                  return (
                    <MobileRow
                      key={po.id}
                      href={`/m/site/receive?po=${po.id}`}
                      icon={Truck}
                      title={po.supplier.name}
                      subtitle={`${po.poNumber}${po.status === "PARTIAL" ? " · partially received" : ""}`}
                      meta={meta}
                      tone={isOverdue ? "danger" : po.status === "PARTIAL" ? "warning" : "default"}
                    />
                  );
                })}
              </div>
            )}

            {/* ── Recent Issues ── */}
            {recentIssues.length > 0 && (
              <>
                <MobileSectionTitle>Recent issues</MobileSectionTitle>
                <div className="flex flex-col gap-1.5">
                  {recentIssues.slice(0, 5).map((i) => (
                    <MobileRow
                      key={i.id}
                      icon={Package}
                      title={i.project?.name ?? "—"}
                      subtitle={`${i.issueNumber ?? "—"} · ${i.lines.length} line${i.lines.length !== 1 ? "s" : ""} · ${i.fromLocation?.name ?? "—"}`}
                      meta={formatDate(i.issueDate)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ── My Projects ── */}
            {projects.length > 0 && (
              <>
                <MobileSectionTitle>My projects</MobileSectionTitle>
                <div className="flex flex-col gap-1.5">
                  {projects.map((p) => (
                    <MobileRow
                      key={p.id}
                      href={`/m/projects/${p.id}`}
                      icon={Building2}
                      title={p.name}
                      badge={<MobileStatusBadge status={p.status} />}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      }}
    </MobileHubPage>
  );
}
