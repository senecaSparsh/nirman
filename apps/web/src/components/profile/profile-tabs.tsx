"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Truck,
  Package,
  ClipboardList,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Home,
  ShieldCheck,
  Users as UsersIcon,
  Briefcase,
  Mail,
  Phone,
  Settings,
  Check,
  Minus,
  Activity,
  Wallet,
  Building2,
  Calendar,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Section, MetricGrid, Metric } from "@/components/page";
import { MyTasksPanel } from "@/components/tasks/my-tasks-panel";
import { BarSeries, PieSeries } from "@/components/reports/charts";
import { cn } from "@/lib/utils";

/**
 * Icon map — the server passes string keys (not icon components,
 * which can't cross the server/client boundary). The client resolves
 * them here. Every icon used by queues or capabilities must be listed.
 */
const ICONS: Record<string, LucideIcon> = {
  truck: Truck,
  package: Package,
  clipboardList: ClipboardList,
  clipboardCheck: ClipboardCheck,
  dollarSign: DollarSign,
  home: Home,
  users: UsersIcon,
  briefcase: Briefcase,
  activity: Activity,
  wallet: Wallet,
  building: Building2,
};

/**
 * ═══════════════════════════════════════════════════════════════════
 * PROFILE TABS — the profile page divided into three focused views.
 *
 * The old page was one long scroll with duplicate numbers (active
 * projects appeared 3×, companies appeared as both counts and lists,
 * the business section duplicated /finance and /projects). This
 * component splits it into tabs so each view is short and complete:
 *
 *   Overview   identity + what needs you (queues + tasks)
 *   Access     role, capabilities, permission matrix, companies, scope
 *   Activity   your action counts + recent audit-log timeline
 *
 * The server page fetches all data and passes it as typed props; this
 * component only handles tab switching and rendering.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Types (matched to what the server page passes) ─────────────────

export type QueueData = {
  key: string;
  title: string;
  consequence: string;
  count: number;
  href: string;
  cta: string;
  urgency: "blocking" | "soon";
  icon: string;
  items: { label: string; sub: string }[];
};

export type MembershipData = {
  id: string;
  company: { id: string; name: string; businessType: string | null };
  role: string;
  isCurrent: boolean;
};

export type ProjectAssignmentData = {
  id: string;
  scopedRole: string;
  project: { id: string; name: string; status: string };
};

export type ActivityCount = { action: string; count: number };

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  timestamp: string;
};

export type Capability = { icon: string; label: string };

export type PermModule = {
  key: string;
  label: string;
  actions: { key: string; label: string; has: boolean }[];
};

export type ProfileTabsProps = {
  // Identity
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  active: boolean;
  createdAt: string | null;
  companyName: string;
  roleLabel: string;
  roleDescription: string;
  canManageCompany: boolean;
  // Work
  queues: QueueData[];
  totalQueues: number;
  blockingQueues: number;
  // Charts
  canSeeProcurement: boolean;
  canSeeStock: boolean;
  procurementTrend: { label: string; count: number; value: number }[];
  totalPOs6mo: number;
  totalSpend6mo: number;
  poTrendDelta: number | null;
  stockHealth: { label: string; value: number }[];
  lowStockCount: number;
  pendingActions: { label: string; value: number }[];
  // Access
  capabilities: Capability[];
  permModules: PermModule[];
  isAllAccess: boolean;
  permCount: number;
  memberships: MembershipData[];
  projectAssignments: ProjectAssignmentData[];
  // Activity
  totalActions: number;
  activityCounts: ActivityCount[];
  auditLogs: AuditLogEntry[];
  hasActivity: boolean;
};

export function ProfileTabs(props: ProfileTabsProps) {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">
          Overview
          {props.totalQueues > 0 && (
            <span className="ml-1.5 rounded bg-danger-soft px-1 py-px text-micro font-semibold text-danger tnum">
              {props.totalQueues}
            </span>
          )}
        </TabsTrigger>
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

      {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
      <TabsContent value="overview" className="space-y-6">
        {/* Identity strip — compact, one place, not duplicated */}
        <IdentityStrip {...props} />

        {/* What needs you — the action layer */}
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="text-section text-foreground">
              {props.totalQueues > 0
                ? `${props.totalQueues} ${props.totalQueues === 1 ? "thing needs" : "things need"} you`
                : "Nothing needs you"}
            </h2>
            {props.blockingQueues > 0 && (
              <span className="text-caption font-semibold text-danger">
                {props.blockingQueues} blocking someone
              </span>
            )}
          </div>

          {props.queues.length > 0 ? (
            <div className="mb-6 space-y-2.5">
              {props.queues.map((q) => (
                <QueueCard key={q.key} queue={q} />
              ))}
            </div>
          ) : (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <p className="text-body text-foreground">
                Your queue is clear.{" "}
                <span className="text-muted-foreground">
                  Approvals, deliveries and stock levels are all where they should be.
                </span>
              </p>
            </div>
          )}

          <MyTasksPanel limit={5} />
        </div>

        {/* ══ Overview charts ═══════════════════════════════════════ */}
        <OverviewCharts {...props} />
      </TabsContent>

      {/* ══ ACCESS ═════════════════════════════════════════════════ */}
      <TabsContent value="access" className="space-y-6">
        {/* Role + capabilities + matrix */}
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
            {/* Capability pills — only the ones this role has */}
            {props.capabilities.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {props.capabilities.map((c) => {
                  const CapIcon = ICONS[c.icon] ?? Activity;
                  return (
                  <span
                    key={c.label}
                    className="flex items-center gap-1 rounded-md bg-subtle px-2 py-1 text-caption font-medium text-foreground"
                  >
                    <CapIcon className="h-3 w-3 text-muted-foreground/60" />
                    {c.label}
                  </span>
                  );
                })}
              </div>
            )}

            {/* Permission matrix — module × action */}
            {props.isAllAccess ? (
              <div className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2.5 text-meta text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Full access — every module, every action. No restrictions.
              </div>
            ) : (
              <PermissionMatrix modules={props.permModules} />
            )}
          </div>
        </Section>

        {/* Companies + project scope — relational identity, one place */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Companies */}
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
              {props.memberships.length <= 1 && (
                <div className="px-4 py-2.5 text-micro text-muted-foreground">
                  Single-company account
                </div>
              )}
            </div>
          </Section>

          {/* Project scope */}
          <Section title="Project scope" description={props.projectAssignments.length > 0 ? undefined : "No project assignments"}>
            {props.projectAssignments.length === 0 ? (
              <p className="px-4 py-6 text-center text-meta text-muted-foreground">
                Not scoped to any projects.
                {props.canManageCompany && (
                  <>{" "}
                    <Link href="/settings/project-assignments" className="text-brand hover:underline">
                      Assign projects →
                    </Link>
                  </>
                )}
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

      {/* ══ ACTIVITY ═══════════════════════════════════════════════ */}
      <TabsContent value="activity" className="space-y-6">
        {props.hasActivity ? (
          <>
            {/* Activity metrics — one instrument panel */}
            <MetricGrid cols={4}>
              <Metric
                label="Total actions"
                value={props.totalActions}
                provenance="Σ all audit-log entries by you"
              />
              {props.activityCounts.slice(0, 3).map((g) => (
                <Metric
                  key={g.action}
                  label={formatActionLabel(g.action)}
                  value={g.count}
                />
              ))}
            </MetricGrid>

            {/* Top actions breakdown */}
            {props.activityCounts.length > 0 && (
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
                      {/* Mini bar — relative to the max */}
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
            )}

            {/* Recent actions — compact timeline */}
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
                    <span className="shrink-0 text-micro tnum text-muted-foreground/70">
                      {timeAgo(new Date(log.timestamp))}
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
  );
}

// ── Overview charts ────────────────────────────────────────────────

export function OverviewCharts(props: ProfileTabsProps) {
  const hasProcurement = props.canSeeProcurement && props.procurementTrend.some((m) => m.count > 0);
  const hasStock = props.canSeeStock && props.stockHealth.length > 0;
  const hasPending = props.pendingActions.length > 0;

  if (!hasProcurement && !hasStock && !hasPending) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-section text-foreground">At a glance</h2>
        <div className="flex flex-wrap gap-2">
          {props.canSeeProcurement && (
            <Link href="/reports/purchase-trends" className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-caption font-medium text-foreground transition-colors hover:bg-subtle">
              Procurement <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {props.canSeeStock && (
            <Link href="/materials" className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-caption font-medium text-foreground transition-colors hover:bg-subtle">
              Materials <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          <Link href="/approvals" className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-caption font-medium text-foreground transition-colors hover:bg-subtle">
            Approvals <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* KPI cards with trend indicators */}
      <div className="grid gap-3 sm:grid-cols-3">
        {props.canSeeProcurement && (
          <KpiCard
            label="POs (6 mo)"
            value={formatNumber(props.totalPOs6mo, 0)}
            sub={formatCurrency(props.totalSpend6mo)}
            delta={props.poTrendDelta}
          />
        )}
        {props.canSeeStock && (
          <KpiCard
            label="Low stock items"
            value={formatNumber(props.lowStockCount, 0)}
            sub={`${formatNumber(props.stockHealth[0]?.value ?? 0, 0)} healthy`}
            delta={props.lowStockCount > 0 ? -1 : 0}
            deltaLabel={props.lowStockCount > 0 ? "needs attention" : "all good"}
          />
        )}
        <KpiCard
          label="Pending actions"
          value={formatNumber(props.pendingActions.reduce((s, a) => s + a.value, 0), 0)}
          sub={`${props.pendingActions.length} categories`}
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {hasProcurement && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-body font-semibold">Procurement trend</h3>
              <span className="text-caption text-muted-foreground tnum">POs / month · 6 mo</span>
            </div>
            <BarSeries
              data={props.procurementTrend.map((m) => ({ label: m.label, value: m.count }))}
              name="POs"
              color="var(--color-stage-procure)"
              currency={false}
              height={220}
            />
          </div>
        )}

        {hasStock && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-body font-semibold">Stock health</h3>
              <span className="text-caption text-muted-foreground">
                {formatNumber(props.stockHealth.reduce((s, m) => s + m.value, 0), 0)} tracked materials
              </span>
            </div>
            <PieSeries
              data={props.stockHealth}
              currency={false}
              height={220}
            />
          </div>
        )}

        {hasPending && (
          <div className={`rounded-lg border border-border bg-card p-4 ${hasProcurement && hasStock ? "lg:col-span-2" : ""}`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-body font-semibold">Pending actions by type</h3>
              <span className="text-caption text-muted-foreground">items needing you</span>
            </div>
            <BarSeries
              data={props.pendingActions}
              name="Count"
              color="var(--color-warning)"
              currency={false}
              horizontal
              height={Math.max(160, props.pendingActions.length * 36)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
}) {
  const showTrend = delta != null && delta !== 0;
  const up = (delta ?? 0) > 0;
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-section font-semibold tnum text-foreground">{value}</span>
        {showTrend && (
          <span className={cn("flex items-center gap-0.5 text-caption font-semibold tnum", up ? "text-success" : "text-danger")}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}{delta}%
          </span>
        )}
      </div>
      {(sub || deltaLabel) && (
        <div className="mt-0.5 text-micro text-muted-foreground">
          {sub}
          {sub && deltaLabel && " · "}
          {deltaLabel}
        </div>
      )}
    </div>
  );
}

// ── Identity strip ─────────────────────────────────────────────────

export function IdentityStrip(props: ProfileTabsProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      {props.image ? (
        <img
          src={props.image}
          alt={props.name}
          className="h-11 w-11 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-body font-semibold text-muted-foreground">
          {props.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-meta text-muted-foreground">
        {props.email && (
          <span className="flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            {props.email}
          </span>
        )}
        {props.phone && (
          <span className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" />
            {props.phone}
          </span>
        )}
        {props.createdAt && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Since {formatDate(props.createdAt)}
          </span>
        )}
        {!props.active && (
          <span className="flex items-center gap-1.5 font-medium text-danger">
            <AlertTriangle className="h-3 w-3" />
            Inactive
          </span>
        )}
      </div>
      {props.canManageCompany && (
        <Link
          href="/settings"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-caption font-medium text-foreground transition-colors hover:bg-subtle"
        >
          <Settings className="h-3.5 w-3.5" />
          Edit
        </Link>
      )}
    </div>
  );
}

// ── Permission matrix ──────────────────────────────────────────────

function PermissionMatrix({ modules }: { modules: PermModule[] }) {
  const maxActions = Math.max(...modules.map((m) => m.actions.length));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-full overflow-hidden rounded-md border border-border">
        {/* Header row */}
        <div className="flex border-b border-border bg-subtle/50">
          <div className="w-32 shrink-0 px-3 py-1.5 text-label text-muted-foreground/70">
            Module
          </div>
          <div className="flex flex-1 divide-x divide-border">
            {Array.from({ length: maxActions }).map((_, i) => (
              <div
                key={i}
                className="flex-1 px-2 py-1.5 text-center text-micro text-muted-foreground/60"
              >
                {modules[0]?.actions[i]?.label ?? ""}
              </div>
            ))}
          </div>
        </div>
        {/* Module rows */}
        {modules.map((mod) => (
          <div key={mod.key} className="flex border-b border-border last:border-b-0">
            <div className="w-32 shrink-0 px-3 py-1.5 text-caption font-medium text-foreground">
              {mod.label}
            </div>
            <div className="flex flex-1 divide-x divide-border">
              {Array.from({ length: maxActions }).map((_, i) => {
                const action = mod.actions[i];
                if (!action) return <div key={i} className="flex-1 px-2 py-1.5" />;
                return (
                  <div
                    key={action.key}
                    className="flex flex-1 items-center justify-center px-2 py-1.5"
                  >
                    {action.has ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground/25" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Queue card ─────────────────────────────────────────────────────

export function QueueCard({ queue }: { queue: QueueData }) {
  const blocking = queue.urgency === "blocking";
  const QueueIcon = ICONS[queue.icon] ?? Activity;
  return (
    <Link
      href={queue.href}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
    >
      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3.5">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            blocking ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
          )}
        >
          <QueueIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-body font-semibold text-foreground">{queue.title}</span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-px text-caption font-semibold tnum",
                blocking ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
              )}
            >
              {queue.count}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
            {blocking && <AlertTriangle className="h-3 w-3 shrink-0 text-danger/70" />}
            {queue.consequence}
          </p>
        </div>
        <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-caption font-semibold text-primary-foreground transition-opacity group-hover:opacity-90">
          {queue.cta} <ArrowRight className="h-3 w-3" />
        </span>
      </div>
      <div className="divide-y divide-border/60 border-t border-border/60 bg-subtle/60">
        {queue.items.slice(0, 3).map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-1.5">
            <span className="min-w-0 truncate text-caption font-medium text-foreground">
              {item.label}
            </span>
            <span className="shrink-0 text-caption tnum text-muted-foreground">
              {item.sub}
            </span>
          </div>
        ))}
        {queue.items.length > 3 && (
          <div className="px-4 py-1.5 text-micro text-muted-foreground">
            +{queue.count - 3} more
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

export function formatActionLabel(action: string): string {
  const parts = action.split(".");
  if (parts.length < 2) return action;
  const moduleName = (parts[0] ?? action).toUpperCase();
  const verb = (parts[1] ?? "").replace(/_/g, " ");
  const verbLabel = verb.charAt(0).toUpperCase() + verb.slice(1);
  return `${moduleName} ${verbLabel}`;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return formatDate(date);
}
