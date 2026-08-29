"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  PackageX,
  Truck,
  CalendarClock,
  ClipboardList,
  ClipboardCheck,
  ShieldCheck,
  TrendingDown,
  ArrowRight,
  RefreshCw,
  Loader2,
  Clock,
  Sun,
  CheckCheck,
} from "lucide-react";
import { formatCurrencyCompact, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

type BriefingData = {
  date: string;
  user: { id: string; name: string; role: string };
  approvals: {
    poCount: number;
    reqCount: number;
    gpCount: number;
    dprCount: number;
    total: number;
    canApprovePo: boolean;
    canApproveReq: boolean;
    canApproveGp: boolean;
    canApproveDpr: boolean;
  };
  lowStock: Array<{ materialId: string; materialName: string; materialCode: string; qty: number; unit: string; reorderPoint: number | null }>;
  deliveriesToday: Array<{ poNumber: string; supplierName: string; projectName: string | null; total: number }>;
  paymentsDue: Array<{ description: string; amount: number; dueDate: string; type: string }>;
  myTasks: Array<{ id: string; title: string; projectName: string | null; dueDate: string | null; priority: string }>;
  myDpr: { submitted: boolean; date: string | null };
  myAttendance: { checkedIn: boolean; status: string | null };
  summary: { activeProjects: number; activeEmployees: number; pendingDprsTotal: number };
};

/**
 * MorningBriefing — a glanceable summary of what needs attention today.
 * Shown at the top of the mobile home page for managers.
 * Field workers see their attendance + DPR + tasks instead.
 */
export function MorningBriefing() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBriefing = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      haptic(10);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch("/api/briefing");
      const json = await res.json();
      if (res.ok) {
        setData(json);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-4 animate-spin text-[color:var(--color-ink-500)]" />
      </div>
    );
  }

  if (!data) return null;

  const isManager = data.approvals.total > 0 || data.lowStock.length > 0 || data.deliveriesToday.length > 0 || data.paymentsDue.length > 0;
  const isFieldWorker = data.myAttendance.status !== null || data.myTasks.length > 0;

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = data.user.name.split(" ")[0];

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <Sun className="size-4" style={{ color: "var(--color-signal)" }} />
          <div>
            <div className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              {greeting}, {firstName}
            </div>
            <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(new Date(data.date))}
            </div>
          </div>
        </div>
        <button
          onClick={() => fetchBriefing(true)}
          disabled={refreshing}
          className="grid place-items-center size-7 rounded-full press disabled:opacity-50"
          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </button>
      </div>

      {/* ── Manager briefing: approvals + alerts ── */}
      {isManager && (
        <>
          {/* Approvals summary */}
          {data.approvals.total > 0 && (
            <BriefingCard
              icon={ClipboardCheck}
              iconBg="var(--color-signal)"
              title="Approvals waiting on you"
              count={data.approvals.total}
              href="/m/pulse/approvals"
              items={[
                data.approvals.canApprovePo && data.approvals.poCount > 0
                  ? { label: `${data.approvals.poCount} Purchase Order${data.approvals.poCount === 1 ? "" : "s"}`, href: "/m/pulse/approvals" }
                  : null,
                data.approvals.canApproveReq && data.approvals.reqCount > 0
                  ? { label: `${data.approvals.reqCount} Indent${data.approvals.reqCount === 1 ? "" : "s"}`, href: "/m/pulse/approvals" }
                  : null,
                data.approvals.canApproveGp && data.approvals.gpCount > 0
                  ? { label: `${data.approvals.gpCount} Gate Pass${data.approvals.gpCount === 1 ? "" : "es"}`, href: "/m/pulse/approvals" }
                  : null,
                data.approvals.canApproveDpr && data.approvals.dprCount > 0
                  ? { label: `${data.approvals.dprCount} DPR${data.approvals.dprCount === 1 ? "" : "s"}`, href: "/m/pulse/approvals" }
                  : null,
              ].filter(Boolean) as { label: string; href: string }[]}
            />
          )}

          {/* Low stock alerts */}
          {data.lowStock.length > 0 && (
            <BriefingCard
              icon={PackageX}
              iconBg="#d97706"
              title="Low stock alerts"
              count={data.lowStock.length}
              href="/m/inventory"
              items={data.lowStock.map((s) => ({
                label: `${s.materialName} — ${s.qty} ${s.unit} left (reorder at ${s.reorderPoint})`,
                href: "/m/inventory",
              }))}
            />
          )}

          {/* Deliveries expected today */}
          {data.deliveriesToday.length > 0 && (
            <BriefingCard
              icon={Truck}
              iconBg="#2d5a8c"
              title="Deliveries expected today"
              count={data.deliveriesToday.length}
              href="/m/procurement"
              items={data.deliveriesToday.map((d) => ({
                label: `${d.poNumber} — ${d.supplierName} (${formatCurrencyCompact(d.total)})`,
                href: "/m/procurement",
              }))}
            />
          )}

          {/* Payments due */}
          {data.paymentsDue.length > 0 && (
            <BriefingCard
              icon={CalendarClock}
              iconBg="#b91c1c"
              title="Payments overdue"
              count={data.paymentsDue.length}
              href="/m/books/finance"
              items={data.paymentsDue.map((p) => ({
                label: `${p.description} — ${formatCurrencyCompact(p.amount)}`,
                href: "/m/books/finance",
              }))}
            />
          )}
        </>
      )}

      {/* ── Field worker briefing: attendance + DPR + tasks ── */}
      {isFieldWorker && (
        <>
          {/* Attendance status */}
          <div className="mx-4 rounded-[0.75rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="size-3.5" style={{ color: data.myAttendance.checkedIn ? "var(--color-go)" : "var(--color-signal)" }} />
              <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                Today&apos;s Attendance
              </span>
            </div>
            {data.myAttendance.checkedIn ? (
              <div className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-go)" }}>
                <CheckCircle2 className="size-3" />
                <span className="font-semibold">Checked in — {data.myAttendance.status}</span>
              </div>
            ) : (
              <Link href="/m/attendance" className="flex items-center gap-1.5 text-m-caption font-semibold text-m-body press" style={{ color: "var(--color-signal)" }}>
                <span>Check in now</span>
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>

          {/* DPR status */}
          <div className="mx-4 rounded-[0.75rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="size-3.5" style={{ color: data.myDpr.submitted ? "var(--color-go)" : "var(--color-signal)" }} />
              <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                Today&apos;s DPR
              </span>
            </div>
            {data.myDpr.submitted ? (
              <div className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-go)" }}>
                <CheckCircle2 className="size-3" />
                <span className="font-semibold">Submitted</span>
              </div>
            ) : (
              <Link href="/m/site" className="flex items-center gap-1.5 text-m-caption font-semibold text-m-body press" style={{ color: "var(--color-signal)" }}>
                <span>Submit DPR</span>
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>

          {/* My tasks */}
          {data.myTasks.length > 0 && (
            <BriefingCard
              icon={CheckCheck}
              iconBg="var(--color-signal)"
              title="My tasks"
              count={data.myTasks.length}
              href="/m/site/tasks"
              items={data.myTasks.map((t) => ({
                label: t.dueDate
                  ? `${t.title} — due ${formatDate(t.dueDate)}`
                  : t.title,
                href: "/m/site/tasks",
              }))}
            />
          )}
        </>
      )}

      {/* ── All clear state ── */}
      {!isManager && !isFieldWorker && (
        <div className="mx-4 rounded-[0.75rem] border p-4 text-center" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <CheckCircle2 className="mx-auto size-6 mb-2" style={{ color: "var(--color-go)" }} />
          <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
            All caught up!
          </p>
          <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            Nothing needs your attention right now.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Reusable briefing card ──────────────────────────────────────

function BriefingCard({
  icon: Icon,
  iconBg,
  title,
  count,
  href,
  items,
}: {
  icon: typeof AlertTriangle;
  iconBg: string;
  title: string;
  count: number;
  href: string;
  items: { label: string; href: string }[];
}) {
  return (
    <Link href={href} className="block mx-4 text-m-body press">
      <div className="rounded-[0.75rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="grid place-items-center size-7 rounded-full" style={{ backgroundColor: iconBg }}>
            <Icon className="size-3.5" style={{ color: "var(--color-paper)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
              {title}
            </div>
            <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {count} item{count === 1 ? "" : "s"}
            </div>
          </div>
          <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-400)" }} />
        </div>
        <div className="space-y-1">
          {items.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-ink-700)" }}>
              <div className="size-1 rounded-full shrink-0" style={{ backgroundColor: "var(--color-ink-300)" }} />
              <span className="truncate">{item.label}</span>
            </div>
          ))}
          {items.length > 3 && (
            <div className="text-m-caption font-semibold pl-2.5" style={{ color: "var(--color-ink-500)" }}>
              +{items.length - 3} more
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
