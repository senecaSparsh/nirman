"use client";

import { useEffect, useState } from "react";
import {
  Bell, Loader2, MessageCircle, Mail, Smartphone,
  CheckCircle2, XCircle, Clock, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";

interface Template {
  id: string;
  eventType: string;
  channel: "WHATSAPP" | "EMAIL" | "IN_APP";
  template: string;
  isActive: boolean;
}

interface NotificationStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

interface LogEntry {
  id: string;
  eventType: string;
  channel: string;
  recipient: string;
  status: "PENDING" | "SENT" | "FAILED";
  message: string;
  createdAt: string;
}

interface Preference {
  id: string;
  eventType: string;
  channel: "WHATSAPP" | "EMAIL" | "IN_APP";
  enabled: boolean;
}

const CHANNEL_ICONS: Record<string, typeof Bell> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  IN_APP: Smartphone,
};

const STATUS_STYLES: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  SENT: { color: "var(--color-go)", icon: CheckCircle2 },
  FAILED: { color: "var(--color-stop)", icon: XCircle },
  PENDING: { color: "var(--color-signal)", icon: Clock },
};

const EVENT_LABELS: Record<string, string> = {
  LOW_STOCK: "Low Stock Alert",
  TASK_ASSIGNMENT: "Task Assignment",
  QUOTE_APPROVAL: "Quote Approval Needed",
  PO_APPROVAL: "PO Approval Needed",
  DPR_SUBMITTED: "Daily Progress Report Submitted",
  PAYMENT_RECEIVED: "Payment Received",
  SALE_CREATED: "Sale Created",
};

export default function MobileNotificationsPage() {
  const [tab, setTab] = useState<"preferences" | "templates" | "log">("preferences");
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadData = async () => {
    setLoading((prev) => (prev ? prev : true));
    try {
      const [prefsRes, tmplRes, logRes] = await Promise.all([
        fetch("/api/notifications/preferences").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/notifications/templates").then((r) => (r.ok ? r.json() : { templates: [], stats: null })),
        fetch("/api/notifications/log?limit=20").then((r) => (r.ok ? r.json() : [])),
      ]);

      if (Array.isArray(prefsRes)) setPreferences(prefsRes);
      if (tmplRes.templates) setTemplates(tmplRes.templates);
      if (tmplRes.stats) setStats(tmplRes.stats);
      if (Array.isArray(logRes)) setLogs(logRes);
    } catch (err) {
      console.error("Failed to load notification data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTogglePref = async (pref: Preference) => {
    setToggling(pref.id);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: pref.eventType,
          channel: pref.channel,
          enabled: !pref.enabled,
        }),
      });
      if (!res.ok) throw new Error("Failed to update preference");
      toast.success(`${pref.channel} notifications ${!pref.enabled ? "enabled" : "disabled"} for ${EVENT_LABELS[pref.eventType] ?? pref.eventType}`);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(null);
    }
  };

  const handleToggleTemplate = async (tmpl: Template) => {
    setToggling(tmpl.id);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: tmpl.eventType,
          channel: tmpl.channel,
          template: tmpl.template,
          isActive: !tmpl.isActive,
        }),
      });
      if (!res.ok) throw new Error("Failed to update template");
      toast.success(`Template ${!tmpl.isActive ? "activated" : "deactivated"}`);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(null);
    }
  };

  const handleTestNotification = async () => {
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "IN_APP",
          recipient: "test",
          message: "Test notification from mobile settings",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Test failed");
      }
      toast.success("Test notification sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MobileBackButton fallback="/m/settings" />
        <div>
          <h1 className="text-[0.9375rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Notifications
          </h1>
          <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
            Alerts, templates & delivery
          </p>
        </div>
      </div>

      {/* Stats banner */}
      {stats ? (
        <div
          className="rounded-[0.625rem] border p-3 grid grid-cols-4 gap-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <StatBox label="Total" value={stats.total} color="var(--color-ink-950)" />
          <StatBox label="Sent" value={stats.sent} color="var(--color-go)" />
          <StatBox label="Pending" value={stats.pending} color="var(--color-signal)" />
          <StatBox label="Failed" value={stats.failed} color="var(--color-stop)" />
        </div>
      ) : null}

      {/* Test button */}
      <button
        onClick={handleTestNotification}
        className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] border py-2.5 text-[0.6875rem] font-bold press"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
      >
        <Send className="size-3.5" />
        Send Test Notification
      </button>

      {/* Tabs */}
      <div className="flex gap-1 rounded-[0.5rem] p-1" style={{ backgroundColor: "var(--color-concrete)" }}>
        {(["preferences", "templates", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 rounded-[0.375rem] py-2 text-[0.625rem] font-bold uppercase tracking-wide press transition-colors"
            style={{
              backgroundColor: tab === t ? "var(--color-paper)" : "transparent",
              color: tab === t ? "var(--color-ink-950)" : "var(--color-ink-500)",
            }}
          >
            {t === "preferences" ? "My Prefs" : t === "templates" ? "Templates" : "Log"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "preferences" ? (
        <PreferencesTab
          preferences={preferences}
          toggling={toggling}
          onToggle={handleTogglePref}
        />
      ) : tab === "templates" ? (
        <TemplatesTab
          templates={templates}
          toggling={toggling}
          expanded={expandedTemplate}
          onExpand={setExpandedTemplate}
          onToggle={handleToggleTemplate}
        />
      ) : (
        <LogTab logs={logs} />
      )}
    </div>
  );
}

/* ─── Stat Box ─── */
function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-[1rem] font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>{label}</p>
    </div>
  );
}

/* ─── Preferences Tab ─── */
function PreferencesTab({
  preferences,
  toggling,
  onToggle,
}: {
  preferences: Preference[];
  toggling: string | null;
  onToggle: (pref: Preference) => void;
}) {
  if (preferences.length === 0) {
    return (
      <div className="rounded-[0.625rem] border p-6 text-center" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <Bell className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
          No notification preferences set. Defaults will be used.
        </p>
      </div>
    );
  }

  // Group by eventType
  const grouped = preferences.reduce<Record<string, Preference[]>>((acc, p) => {
    (acc[p.eventType] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([eventType, prefs]) => (
        <div
          key={eventType}
          className="rounded-[0.625rem] border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-[0.6875rem] font-bold mb-2" style={{ color: "var(--color-ink-950)" }}>
            {EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ")}
          </p>
          <div className="space-y-1.5">
            {prefs.map((pref) => {
              const Icon = CHANNEL_ICONS[pref.channel] ?? Bell;
              return (
                <div key={pref.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                    <span className="text-[0.625rem] font-medium" style={{ color: "var(--color-ink-700)" }}>
                      {pref.channel.replace(/_/g, " ")}
                    </span>
                  </div>
                  <button
                    onClick={() => onToggle(pref)}
                    disabled={toggling === pref.id}
                    className="relative w-10 h-5 rounded-full transition-colors press"
                    style={{
                      backgroundColor: pref.enabled ? "var(--color-go)" : "var(--color-concrete)",
                    }}
                  >
                    <div
                      className="absolute top-0.5 size-4 rounded-full bg-white transition-transform"
                      style={{ transform: pref.enabled ? "translateX(1.25rem)" : "translateX(0.125rem)" }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Templates Tab ─── */
function TemplatesTab({
  templates,
  toggling,
  expanded,
  onExpand,
  onToggle,
}: {
  templates: Template[];
  toggling: string | null;
  expanded: string | null;
  onExpand: (id: string | null) => void;
  onToggle: (tmpl: Template) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-[0.625rem] border p-6 text-center" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <Bell className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
          No notification templates configured.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {templates.map((tmpl) => {
        const Icon = CHANNEL_ICONS[tmpl.channel] ?? Bell;
        const isExpanded = expanded === tmpl.id;
        return (
          <div
            key={tmpl.id}
            className="rounded-[0.625rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <button
              onClick={() => onExpand(isExpanded ? null : tmpl.id)}
              className="w-full flex items-center gap-2 p-3 text-left"
            >
              <Icon className="size-4 shrink-0" style={{ color: "var(--color-steel)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {EVENT_LABELS[tmpl.eventType] ?? tmpl.eventType.replace(/_/g, " ")}
                </p>
                <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  {tmpl.channel.replace(/_/g, " ")}
                </p>
              </div>
              <span
                className="text-[0.5rem] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  color: tmpl.isActive ? "var(--color-go)" : "var(--color-ink-500)",
                  backgroundColor: tmpl.isActive ? "color-mix(in srgb, var(--color-go) 12%, transparent)" : "var(--color-concrete)",
                }}
              >
                {tmpl.isActive ? "Active" : "Off"}
              </span>
              {isExpanded ? <ChevronUp className="size-4" style={{ color: "var(--color-ink-500)" }} /> : <ChevronDown className="size-4" style={{ color: "var(--color-ink-500)" }} />}
            </button>
            {isExpanded ? (
              <div className="px-3 pb-3 space-y-2 border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
                <div className="rounded-[0.375rem] p-2 font-mono text-[0.5625rem]" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}>
                  {tmpl.template}
                </div>
                <button
                  onClick={() => onToggle(tmpl)}
                  disabled={toggling === tmpl.id}
                  className="w-full rounded-[0.375rem] border py-2 text-[0.625rem] font-bold press disabled:opacity-50"
                  style={{
                    borderColor: tmpl.isActive ? "var(--color-stop)" : "var(--color-go)",
                    color: tmpl.isActive ? "var(--color-stop)" : "var(--color-go)",
                    backgroundColor: "var(--color-paper)",
                  }}
                >
                  {toggling === tmpl.id ? "..." : tmpl.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Log Tab ─── */
function LogTab({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-[0.625rem] border p-6 text-center" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <Clock className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
          No notifications sent yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {logs.map((log) => {
        const status = STATUS_STYLES[log.status] ?? STATUS_STYLES.PENDING!;
        const StatusIcon = status.icon;
        const Icon = CHANNEL_ICONS[log.channel] ?? Bell;
        return (
          <div
            key={log.id}
            className="rounded-[0.625rem] border p-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="flex items-start gap-2">
              <Icon className="size-3.5 mt-0.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {EVENT_LABELS[log.eventType] ?? log.eventType.replace(/_/g, " ")}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusIcon className="size-3" style={{ color: status.color }} />
                    <span className="text-[0.5rem] font-bold uppercase" style={{ color: status.color }}>
                      {log.status}
                    </span>
                  </div>
                </div>
                <p className="text-[0.5625rem] mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                  To: {log.recipient}
                </p>
                <p className="text-[0.5625rem] mt-0.5 line-clamp-2" style={{ color: "var(--color-ink-700)" }}>
                  {log.message}
                </p>
                <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                  {new Date(log.createdAt).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
