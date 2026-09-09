import Link from "next/link";
import {
  ArrowRight,
  Users,
  MapPin,
  Clock,
  Circle,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { getCurrentUser, toNum } from "@/lib/server";
import { migrateRole, ROLES, PERM } from "@/lib/roles";
import { loadQuickActionContext } from "@/lib/quick-action-server";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { HrInteractive } from "./hr-interactive";
import {
  OrgHierarchy,
  type OrgTreeData,
} from "./OrgHierarchy";
import { buildOrgTree } from "@/lib/org-tree-builder";

/**
 * HR module home — the second tab.
 *
 * Visual architecture:
 *   1. Attention banner carousel — pending approvals, draft payroll, absent workers
 *   2. Field / People toggle + quick actions grid
 *   3. Organization tree — reporting line + scope assignments
 *   4. Today — compact 3-line summary (attendance, site presence, pending)
 *
 * Covers: attendance (half/full/late), DPR (daily progress reports:
 * labor, work, attendance time), employees, payroll, leaves, tasks.
 */
export default function HrHomePage() {
  return (
    <MobileHubPage perm={PERM.HR_VIEW} what="HR" permission="hr.view">
      {async ({ company }) => {
        const currentUser = await getCurrentUser();

        const today = new Date();
        const todayDateOnly = new Date(
          Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
        );

        const [
          recentDprs,
          employees,
          todayAttendance,
          presentToday,
          absentToday,
          pendingDprCount,
          pendingLeaveCount,
          draftPayroll,
          todayProjectAttendance,
          orgTree,
          qaCtx,
        ] = await Promise.all([
          prisma.dailyProgressReport
            .findMany({
              where: { project: { companyId: company.id } },
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { project: { select: { name: true } } },
            })
            .catch(() => []),
          prisma.employee
            .count({
              where: { companyId: company.id, active: true, deletedAt: null },
            })
            .catch(() => 0),
          prisma.workerAttendance
            .count({
              where: {
                company: { id: company.id },
                date: todayDateOnly,
              },
            })
            .catch(() => 0),
          prisma.workerAttendance
            .count({
              where: {
                company: { id: company.id },
                date: todayDateOnly,
                status: { in: ["PRESENT", "OVERTIME"] },
              },
            })
            .catch(() => 0),
          prisma.workerAttendance
            .count({
              where: {
                company: { id: company.id },
                date: todayDateOnly,
                status: "ABSENT",
              },
            })
            .catch(() => 0),
          prisma.dailyProgressReport
            .count({
              where: {
                project: { companyId: company.id },
                approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] },
              },
            })
            .catch(() => 0),
          prisma.leaveRequest
            .count({
              where: { companyId: company.id, status: "PENDING" },
            })
            .catch(() => 0),
          prisma.payrollPeriod
            .findFirst({
              where: { companyId: company.id, status: "DRAFT" },
              orderBy: [{ year: "desc" }, { month: "desc" }],
              select: { id: true, month: true, year: true, totalNet: true },
            })
            .catch(() => null),
          prisma.workerAttendance
            .findMany({
              where: {
                company: { id: company.id },
                date: todayDateOnly,
                status: { in: ["PRESENT", "OVERTIME"] },
              },
              include: { project: { select: { name: true } } },
            })
            .catch(() => []),
          loadOrgTree(company.id, company.name, currentUser?.id ?? null),
          loadQuickActionContext("hr"),
        ]);

        // ── Compute site presence today (top 2 projects for the summary line) ──
        const projectMap = new Map<string, number>();
        for (const r of todayProjectAttendance) {
          const name = r.project?.name ?? "Unassigned";
          projectMap.set(name, (projectMap.get(name) ?? 0) + 1);
        }
        const topSites = Array.from(projectMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);

        // ── Build attention banners ──
        const attentionBanners: AttentionBanner[] = [];

        // Pending DPR approvals
        if (pendingDprCount > 0) {
          attentionBanners.push({
            id: "dpr-approvals",
            title: `${pendingDprCount} Daily Progress Report${pendingDprCount !== 1 ? "s" : ""} pending approval`,
            subtitle: `Daily progress reports awaiting review`,
            href: "/m/dprs",
            severity: "low",
            qtyText: String(pendingDprCount),
            category: "DPR Approvals",
          });
        }

        // Draft payroll
        if (draftPayroll) {
          const monthName = new Date(2000, draftPayroll.month - 1, 1).toLocaleString(
            "en-IN",
            { month: "short" },
          );
          attentionBanners.push({
            id: "draft-payroll",
            title: `Payroll draft — ${monthName} ${draftPayroll.year}`,
            subtitle: draftPayroll.totalNet
              ? `Net payable: ${formatCurrency(toNum(draftPayroll.totalNet))}`
              : `Awaiting approval to process`,
            href: "/m/books/payroll",
            severity: "low",
            qtyText: "Draft",
            category: "Payroll",
          });
        }

        // Pending leave requests
        if (pendingLeaveCount > 0) {
          attentionBanners.push({
            id: "leave-approvals",
            title: `${pendingLeaveCount} leave request${pendingLeaveCount !== 1 ? "s" : ""} pending`,
            subtitle: `Leave applications awaiting approval`,
            href: "/m/hr/leaves",
            severity: "low",
            qtyText: String(pendingLeaveCount),
            category: "Leave Approvals",
          });
        }

        // Absent workers today
        if (absentToday > 0) {
          attentionBanners.push({
            id: "absent-today",
            title: `${absentToday} worker${absentToday !== 1 ? "s" : ""} absent today`,
            subtitle: `${presentToday} present · ${todayAttendance - presentToday - absentToday} other status`,
            href: "/m/attendance",
            severity: "out",
            qtyText: String(absentToday),
            category: "Attendance",
          });
        }

        // Individual pending DPRs (most recent first)
        for (const dpr of recentDprs.filter(
          (d) =>
            d.approvalStatus === "SUBMITTED" ||
            d.approvalStatus === "SUB_ADMIN_APPROVED",
        )) {
          attentionBanners.push({
            id: dpr.id,
            title: `DPR — ${dpr.project?.name ?? "—"}`,
            subtitle: `${formatDate(dpr.date)} · ${dpr.approvalStatus === "SUBMITTED" ? "Awaiting sub-admin" : "Awaiting admin"}`,
            href: `/m/dprs/${dpr.id}`,
            severity: "low",
            qtyText: dpr.approvalStatus === "SUBMITTED" ? "New" : "Sub",
            category: "Daily Progress Report",
          });
        }

        // If no alerts, show contextual banner
        if (attentionBanners.length === 0) {
          if (todayAttendance === 0 && employees > 0) {
            // Attendance hasn't been recorded yet — prompt the user
            attentionBanners.push({
              id: "attendance-pending",
              title: "Attendance not yet recorded",
              subtitle: `${employees} active employees · Take today's attendance to get started`,
              href: "/m/site/attendance",
              severity: "low",
              qtyText: "!",
              category: "Attendance Pending",
            });
          } else {
            attentionBanners.push({
              id: "clear",
              title: "All caught up!",
              subtitle: `${employees} active employees · ${presentToday} present today · no pending approvals`,
              href: "/m/hr/employees",
              severity: "clear",
              qtyText: "✓",
              category: "Everything looks good",
            });
          }
        }

        const totalPending = pendingDprCount + pendingLeaveCount + (draftPayroll ? 1 : 0);

        return (
          <div>
            {/* ── 1. Attention banner carousel ── */}
            <AttentionBannerCarousel
              banners={attentionBanners}
              approvalsCount={totalPending}
            />

            {/* ── 2. Field / People toggle + quick actions ── */}
            <HrInteractive persona={qaCtx.persona} savedLayouts={qaCtx.savedLayouts} extraActions={qaCtx.extraActions} />

            {/* ── 3. Organization tree — reporting line + scope assignments ── */}
            <SectionHead title="Organization" />
            <OrgHierarchy tree={orgTree} />

            {/* ── 4. Today — compact 3-line summary with status flags ──
                Replaces the old traffic-light cards, workforce breakdown bars,
                pending approvals queue, and recent DPRs list. One scannable
                block that answers "what's happening right now" in 3 lines.
                Each line has a colored dot flag: green=ok, amber=attention,
                red=urgent, grey=no data. */}
            <SectionHead title="Today" />
            <div
              className="rounded-[0.625rem] border overflow-hidden mb-4"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              {/* Attendance line — flag: red if absent, grey if not recorded, green if all present */}
              <Link
                href="/m/attendance"
                className="flex items-center gap-2.5 px-3 py-3 text-m-body press"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <Circle
                  className="size-2 shrink-0 fill-current"
                  style={{
                    color: todayAttendance === 0 ? "var(--color-ink-300)"
                      : absentToday > 0 ? "var(--color-stop)"
                      : "var(--color-go)",
                  }}
                />
                <Users className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                <span className="flex-1 text-m-body" style={{ color: "var(--color-ink-950)" }}>
                  {todayAttendance > 0 ? (
                    <>
                      <span className="font-bold tabular-nums">{presentToday}</span> present
                      {absentToday > 0 && (
                        <> · <span className="font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>{absentToday}</span> absent</>
                      )}
                      {todayAttendance - presentToday - absentToday > 0 && (
                        <> · <span className="tabular-nums">{todayAttendance - presentToday - absentToday}</span> other</>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--color-ink-500)" }}>
                      Attendance not recorded · {employees} employees
                    </span>
                  )}
                </span>
                <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
              </Link>

              {/* Site presence line — flag: green if present, grey if no data */}
              <Link
                href="/m/attendance"
                className="flex items-center gap-2.5 px-3 py-3 text-m-body press"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <Circle
                  className="size-2 shrink-0 fill-current"
                  style={{
                    color: topSites.length > 0 ? "var(--color-go)" : "var(--color-ink-300)",
                  }}
                />
                <MapPin className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                <span className="flex-1 text-m-body truncate" style={{ color: "var(--color-ink-950)" }}>
                  {topSites.length > 0 ? (
                    topSites.map(([name, count], i) => (
                      <span key={name}>
                        {i > 0 && " · "}
                        <span className="font-bold tabular-nums">{count}</span> at {name}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--color-ink-500)" }}>No one checked in yet</span>
                  )}
                </span>
                <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
              </Link>

              {/* Pending line — flag: red if any pending, green if clear */}
              <Link
                href={pendingDprCount > 0 ? "/m/dprs" : pendingLeaveCount > 0 ? "/m/hr/leaves" : draftPayroll ? "/m/books/payroll" : "/m/hr"}
                className="flex items-center gap-2.5 px-3 py-3 text-m-body press"
              >
                <Circle
                  className="size-2 shrink-0 fill-current"
                  style={{
                    color: totalPending > 0 ? "var(--color-signal)" : "var(--color-go)",
                  }}
                />
                <Clock className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                <span className="flex-1 text-m-body" style={{ color: "var(--color-ink-950)" }}>
                  {totalPending > 0 ? (
                    <>
                      {pendingDprCount > 0 && (
                        <><span className="font-bold tabular-nums">{pendingDprCount}</span> DPR{pendingDprCount !== 1 ? "s" : ""} </>
                      )}
                      {pendingLeaveCount > 0 && (
                        <>{pendingDprCount > 0 && " · "}<span className="font-bold tabular-nums">{pendingLeaveCount}</span> leave{pendingLeaveCount !== 1 ? "s" : ""} </>
                      )}
                      {draftPayroll && (
                        <>{(pendingDprCount > 0 || pendingLeaveCount > 0) && " · "}Payroll draft</>
                      )}
                      <span style={{ color: "var(--color-ink-500)" }}> pending</span>
                    </>
                  ) : (
                    <span style={{ color: "var(--color-go)" }}>All caught up — nothing pending</span>
                  )}
                </span>
                <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
              </Link>
            </div>
          </div>
        );
      }}
    </MobileHubPage>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ORG TREE LOADER — builds the people hierarchy for the OrgHierarchy tree.

   Fetches every membership in the company with their reporting line, scope
   assignments (projects/departments), open tasks, and recent DPRs — then
   assembles two views:
     1. Reporting tree  — roots = memberships with no in-company reportsTo
     2. Assignment tree — people grouped by project / department (+ unassigned)
   ═══════════════════════════════════════════════════════════════════════════ */
async function loadOrgTree(
  companyId: string,
  companyName: string,
  currentUserId: string | null,
): Promise<OrgTreeData> {
  const today = new Date();
  const todayDateOnly = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  // ── Fetch all memberships with user info, scopes, and reporting line ──
  const memberships = await prisma.userCompany.findMany({
    where: { companyId, user: { isHidden: { not: true } } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          active: true,
          designation: true,
          department: true,
          employeeCode: true,
        },
      },
      scopes: {
        include: {
          department: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  // ── Fetch hierarchy levels from Employee records (linked via userId) ──
  const userIds = memberships.map((m) => m.userId);
  const employees = await prisma.employee.findMany({
    where: { companyId, userId: { in: userIds }, deletedAt: null },
    select: { userId: true, hierarchyLevel: true },
  });
  const hierarchyByUserId = new Map(employees.map((e) => [e.userId, e.hierarchyLevel]));

  if (memberships.length === 0) {
    return {
      companyName,
      peopleCount: 0,
      projectCount: 0,
      roots: [],
      unassigned: [],
      projects: [],
      departments: [],
      labourByTrade: [],
      labourCount: 0,
    };
  }

  // ── Open tasks + ALL tasks + recent DPRs + crews + unassigned employees
  //    + today's attendance + leave requests ──
  const [tasks, allTasks, dprs, crews, unassignedEmployees, todayAttendanceRows, leaveRows] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToId: { in: userIds }, status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      orderBy: { createdAt: "desc" },
    }),
    // ALL tasks (including COMPLETED) for the task summary breakdown
    prisma.task.findMany({
      where: { assignedToId: { in: userIds } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      orderBy: { createdAt: "desc" },
      take: 500, // cap to avoid huge payloads
    }),
    prisma.dailyProgressReport.findMany({
      where: { submittedById: { in: userIds } },
      orderBy: { date: "desc" },
      take: userIds.length * 5,
      select: { id: true, date: true, approvalStatus: true, submittedById: true, project: { select: { name: true } } },
    }),
    // Crews with their supervisor (→ Employee → userId) and members
    prisma.crew.findMany({
      where: { companyId, active: true },
      include: {
        supervisor: { select: { userId: true } },
        project: { select: { name: true } },
        members: {
          where: { deletedAt: null, active: true },
          select: {
            id: true,
            name: true,
            trade: true,
            designation: true,
            wageType: true,
            dailyRate: true,
            monthlySalary: true,
            active: true,
            crewId: true,
            phone: true,
            activeProject: { select: { name: true } },
          },
        },
      },
    }),
    // Employees not in any crew (field labour without a formal team)
    prisma.employee.findMany({
      where: { companyId, deletedAt: null, crewId: null },
      select: {
        id: true,
        name: true,
        trade: true,
        designation: true,
        wageType: true,
        dailyRate: true,
        monthlySalary: true,
        active: true,
        crewId: true,
        phone: true,
        activeProject: { select: { name: true } },
      },
    }),
    // Today's attendance for employees linked to these users
    prisma.workerAttendance.findMany({
      where: {
        company: { id: companyId },
        date: todayDateOnly,
        employee: { userId: { in: userIds } },
      },
      select: {
        employeeId: true,
        status: true,
        checkIn: true,
        checkOut: true,
        employee: { select: { userId: true } },
        project: { select: { name: true } },
      },
    }).catch(() => []),
    // Leave requests for employees linked to these users (pending + approved-today)
    prisma.leaveRequest.findMany({
      where: {
        company: { id: companyId },
        employee: { userId: { in: userIds } },
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
        startDate: true,
        endDate: true,
        employee: { select: { userId: true } },
      },
    }).catch(() => []),
  ]);

  // ── Build the tree (shared logic with tier-based inference + teams) ──
  const roleTierFn = (role: string): number => {
    const r = migrateRole(role) ?? "SUPERVISOR";
    return ROLES[r]?.tier ?? 5;
  };
  const roleLabelFn = (role: string): string => {
    const r = migrateRole(role) ?? "SUPERVISOR";
    return ROLES[r]?.label ?? r;
  };

  // ── Inject hierarchyLevel into memberships (from Employee records) ──
  const membershipsWithHierarchy = memberships.map((m) => ({
    ...m,
    hierarchyLevel: hierarchyByUserId.get(m.userId) ?? null,
  }));

  const { roots, unassigned, projects, departments, labourByTrade, labourCount } = buildOrgTree(
    membershipsWithHierarchy as unknown as Parameters<typeof buildOrgTree>[0],
    tasks as unknown as Parameters<typeof buildOrgTree>[1],
    dprs as unknown as Parameters<typeof buildOrgTree>[2],
    crews as unknown as Parameters<typeof buildOrgTree>[3],
    unassignedEmployees as unknown as Parameters<typeof buildOrgTree>[4],
    currentUserId,
    roleTierFn,
    roleLabelFn,
    allTasks as unknown as Parameters<typeof buildOrgTree>[8],
    todayAttendanceRows as unknown as Parameters<typeof buildOrgTree>[9],
    leaveRows as unknown as Parameters<typeof buildOrgTree>[10],
  );

  return {
    companyName,
    peopleCount: memberships.length,
    projectCount: projects.length,
    roots,
    unassigned,
    projects,
    departments,
    labourByTrade,
    labourCount,
  };
}
