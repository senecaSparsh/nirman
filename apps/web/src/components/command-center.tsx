"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Section } from "@/components/page";
import { MyTasksPanel } from "@/components/tasks/my-tasks-panel";
import { cn } from "@/lib/utils";
import { useDashboardPolling } from "@/lib/use-dashboard-polling";
import {
  OverviewCharts,
  QueueCard,
  IdentityStrip,
  formatActionLabel,
  type ProfileTabsProps,
} from "@/components/profile/profile-tabs";

/**
 * ═══════════════════════════════════════════════════════════════════
 * COMMAND CENTER — the role-adaptive landing page (§44.3)
 *
 * Replaces the old Profile page. The dashboard is primary; the profile
 * (identity, access, activity) is secondary — accessible via a tab
 * strip at the bottom.
 *
 * Structure:
 *   1. Greeting line — "Good morning, Amit. 3 things need you."
 *   2. KPI strip — the most important numbers for this role
 *   3. Attention queue — blocking items first, then "soon" items
 *   4. Tasks — assigned to you
 *   5. At a glance — procurement trend, stock health, pending actions
 *   6. Profile tab strip — Access + Activity (secondary)
 * ═══════════════════════════════════════════════════════════════════
 */
export function CommandCenter(props: ProfileTabsProps) {
  const [profileTab, setProfileTab] = useState<string | null>(null);
  const polledCounts = useDashboardPolling();

  const greeting = getGreeting();
  const firstName = props.name.split(" ")[0] ?? props.name;

  // ── Merge polled counts over server-fetched props ──────────────
  // The server renders the initial page with full data (item lists,
  // charts, etc.). The polling hook fetches just the counts every 30s
  // and overrides the numbers so the dashboard stays fresh without
  // a full page reload. Item lists are NOT refreshed by polling —
  // only the counts change. A page refresh will bring in new items.
  const totalQueues = polledCounts?.totalQueues ?? props.totalQueues;
  const blockingQueues = polledCounts?.blockingQueues ?? props.blockingQueues;
  const lowStockCount = polledCounts?.kpis.lowStockCount ?? props.lowStockCount;
  const totalPOs6mo = polledCounts?.kpis.totalPOs6mo ?? props.totalPOs6mo;
  const totalSpend6mo = polledCounts?.kpis.totalSpend6mo ?? props.totalSpend6mo;
  const pendingActions = polledCounts?.kpis.pendingActions ?? props.pendingActions;

  // Update queue counts from polled data (keep server item lists)
  const queues = polledCounts
    ? props.queues.map((q) => {
        const polled = polledCounts.queues.find((pq) => pq.key === q.key);
        return polled ? { ...q, count: polled.count } : q;
      })
    : props.queues;

  const hasQueues = queues.length > 0;

  return (
    <div className="space-y-6">
      {/* ══ 1. Greeting ════════════════════════════════════════════ */}
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-section text-foreground">
          {greeting}, {firstName}.
          {hasQueues ? (
            <>
              {" "}
              <span className="text-muted-foreground">
                {totalQueues} {totalQueues === 1 ? "thing needs" : "things need"} you.
              </span>
            </>
          ) : (
            <span className="text-muted-foreground"> Everything&apos;s in order.</span>
          )}
        </h2>
        {blockingQueues > 0 && (
          <span className="shrink-0 text-caption font-semibold text-danger">
            {blockingQueues} blocking
          </span>
        )}
      </div>

      {/* ══ 2. KPI strip ═══════════════════════════════════════════ */}
      <KpiStrip
        {...props}
        totalQueues={totalQueues}
        blockingQueues={blockingQueues}
        lowStockCount={lowStockCount}
        totalPOs6mo={totalPOs6mo}
        totalSpend6mo={totalSpend6mo}
        pendingActions={pendingActions}
      />

      {/* ══ 3. Attention queue ══════════════════════════════════════ */}
      {hasQueues ? (
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h3 className="text-body font-semibold text-foreground">Needs your attention</h3>
            {blockingQueues > 0 && (
              <Link
                href="/approvals"
                className="flex items-center gap-1 text-caption font-medium text-brand transition-opacity hover:opacity-80"
              >
                Review all <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          <div className="space-y-2.5">
            {queues.map((q) => (
              <QueueCard key={q.key} queue={q} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <p className="text-body text-foreground">
            Your queue is clear.{" "}
            <span className="text-muted-foreground">
              Approvals, deliveries and stock levels are all where they should be.
            </span>
          </p>
        </div>
      )}

      {/* ══ 4. Tasks ═══════════════════════════════════════════════ */}
      <MyTasksPanel limit={5} />

      {/* ══ 5. At a glance (charts) ═════════════════════════════════ */}
      <OverviewCharts
        {...props}
        pendingActions={pendingActions}
        lowStockCount={lowStockCount}
      />

      {/* ══ 6. Profile (secondary) ══════════════════════════════════ */}
      <div className="border-t border-border pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-body font-semibold text-foreground">Your profile</h3>
          <button
            onClick={() => setProfileTab(profileTab ? null : "access")}
            className="text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {profileTab ? "Hide" : "Show details"}
          </button>
        </div>

        {/* Compact identity strip — always visible */}
        <IdentityStrip {...props} />

        {/* Expandable access + activity */}
        {profileTab && (
          <div className="mt-4">
            <Tabs value={profileTab} onValueChange={setProfileTab}>
              <TabsList>
                <TabsTrigger value="access">Access</TabsTrigger>
                <TabsTrigger value="activity">
                  Activity
                  {props.hasActivity && (
                    <span className="ml-1.5 text-micro text-muted-foreground tnum">
                      {props.totalActions}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="access" className="space-y-6">
                <Section
                  title="Role & permissions"
                  description={props.roleDescription}
                  action={
                    <span className="text-caption text-muted-foreground">
                      {props.isAllAccess ? "All permissions" : `${props.permCount} permissions`}
                    </span>
                  }
                >
                  <div className="p-4">
                    {props.capabilities.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {props.capabilities.map((c) => (
                          <span
                            key={c.label}
                            className="flex items-center gap-1 rounded-md bg-subtle px-2 py-1 text-caption font-medium text-foreground"
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {props.isAllAccess ? (
                      <div className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2.5 text-meta text-muted-foreground">
                        Full access — every module, every action.
                      </div>
                    ) : (
                      <p className="text-meta text-muted-foreground">
                        {props.permCount} permissions across {props.permModules.length} modules.
                      </p>
                    )}
                  </div>
                </Section>

                {/* Companies + project scope */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <Section title="Companies">
                    <div className="divide-y divide-border">
                      <div className="flex items-center gap-2.5 bg-subtle/50 px-4 py-2.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                        <span className="min-w-0 flex-1 truncate text-caption font-semibold text-foreground">
                          {props.companyName}
                        </span>
                        <span className="shrink-0 text-micro text-muted-foreground">Current</span>
                      </div>
                      {props.memberships
                        .filter((m) => !m.isCurrent)
                        .map((m) => (
                          <Link
                            key={m.id}
                            href={`/api/company/switch?id=${m.company.id}`}
                            className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-subtle"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
                            <span className="min-w-0 flex-1 truncate text-caption text-foreground">
                              {m.company.name}
                            </span>
                            <span className="shrink-0 text-micro text-muted-foreground">{m.role}</span>
                          </Link>
                        ))}
                    </div>
                  </Section>

                  <Section title="Project scope">
                    {props.projectAssignments.length === 0 ? (
                      <p className="px-4 py-6 text-center text-meta text-muted-foreground">
                        Not scoped to any projects.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {props.projectAssignments.map((a) => (
                          <Link
                            key={a.id}
                            href={`/projects/${a.project.id}`}
                            className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-subtle"
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                a.project.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/35",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate text-caption text-foreground">
                              {a.project.name}
                            </span>
                            <span className="shrink-0 text-micro text-muted-foreground">{a.scopedRole}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Section>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="space-y-6">
                {props.hasActivity ? (
                  <>
                    <Section title="Action breakdown" description="What you've done, by type">
                      <div className="divide-y divide-border">
                        {props.activityCounts.map((g) => (
                          <div key={g.action} className="flex items-center gap-3 px-4 py-2">
                            <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                              {formatActionLabel(g.action)}
                            </span>
                            <span className="shrink-0 text-caption tnum text-muted-foreground">
                              {g.count}
                            </span>
                            <span className="relative h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                              <span
                                className="absolute inset-y-0 left-0 rounded-full bg-foreground/40"
                                style={{
                                  width: `${(g.count / (props.activityCounts[0]?.count || 1)) * 100}%`,
                                }}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    </Section>

                    <Section title="Recent actions">
                      <div className="divide-y divide-border">
                        {props.auditLogs.map((log) => (
                          <div key={log.id} className="flex items-center gap-3 px-4 py-2">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/30" />
                            <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                              {formatActionLabel(log.action)}
                            </span>
                            <span className="shrink-0 text-caption text-muted-foreground">
                              {log.entityType}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  </>
                ) : (
                  <div className="rounded-lg border border-border bg-card px-4 py-12 text-center">
                    <p className="text-body text-muted-foreground">
                      No actions recorded yet. Your activity will appear here as you work.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Strip ────────────────────────────────────────────────────────

function KpiStrip(props: ProfileTabsProps) {
  // Build the KPI strip from the data we already have.
  // Show different KPIs based on what the role can see.
  const kpis: { label: string; value: string; sub?: string; tone?: "default" | "warning" | "danger" }[] = [];

  if (props.canSeeProcurement) {
    kpis.push({
      label: "POs (6 mo)",
      value: formatNumberShort(props.totalPOs6mo),
      sub: formatCurrencyShort(props.totalSpend6mo),
    });
  }

  if (props.canSeeStock) {
    kpis.push({
      label: "Low stock",
      value: formatNumberShort(props.lowStockCount),
      sub: `${props.stockHealth[0]?.value ?? 0} healthy`,
      tone: props.lowStockCount > 0 ? "warning" : "default",
    });
  }

  kpis.push({
    label: "Pending actions",
    value: formatNumberShort(props.pendingActions.reduce((s, a) => s + a.value, 0)),
    sub: `${props.pendingActions.length} categories`,
    tone: props.blockingQueues > 0 ? "danger" : "default",
  });

  if (props.totalQueues > 0) {
    kpis.push({
      label: "Needs you",
      value: formatNumberShort(props.totalQueues),
      sub: `${props.blockingQueues} blocking`,
      tone: props.blockingQueues > 0 ? "danger" : "warning",
    });
  }

  if (kpis.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="text-label text-muted-foreground/70">{kpi.label}</div>
          <div
            className={cn(
              "mt-1 text-title font-semibold tnum",
              kpi.tone === "warning" && "text-warning",
              kpi.tone === "danger" && "text-danger",
              (!kpi.tone || kpi.tone === "default") && "text-foreground",
            )}
          >
            {kpi.value}
          </div>
          {kpi.sub && (
            <div className="mt-0.5 text-micro text-muted-foreground">{kpi.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatNumberShort(n: number): string {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatCurrencyShort(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}
