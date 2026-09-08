"use client";

import { useState, useEffect } from "react";
import {
  Phone, Server, ShieldCheck, Cloud, Plus, Trash2, UserMinus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronDown, ChevronUp, Loader2, CheckCircle2, FileText,
  PhoneIncoming, Mic, MicOff,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useConfirm } from "@/lib/use-confirm";
import {
  MobileSummaryStrip,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import {
  Card,
  Badge,
  Button,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  phoneNormalized: string;
  numberType: string;
  provider: string | null;
  department: string | null;
  label: string | null;
  status: string;
  assignedTo: { id: string; name: string } | null;
  _count: { calls: number };
}

interface Provider {
  id: string;
  provider: string;
  webhookUrl: string;
  active: boolean;
}

interface ConsentPolicy {
  id: string;
  version: number;
  policyText: string;
  effectiveAt: string;
  _count: { acceptances: number };
}

interface Member {
  id: string;
  name: string;
  role: string;
}

interface CompanyConfig {
  recordingConsentBeep: boolean;
  recordingRetentionDays: number;
  recordingAutoDelete: boolean;
  recordingStorageProvider: string;
  recordingMode: string;
}

interface RecordingMember {
  userId: string;
  name: string;
  role: string;
  active: boolean;
  recordCalls: boolean;
}

interface Props {
  company: CompanyConfig;
  phoneNumbers: PhoneNumber[];
  providers: Provider[];
  consentPolicy: ConsentPolicy | null;
  members: Member[];
  recordingMembers: RecordingMember[];
  canManage: boolean;
}

type Tab = "numbers" | "providers" | "consent" | "recording" | "twilio";

export function MobileTelephonyView({
  company,
  phoneNumbers,
  providers,
  consentPolicy,
  members,
  recordingMembers,
  canManage,
}: Props) {
  const [tab, setTab] = useState<Tab>("numbers");

  const assignedCount = phoneNumbers.filter((n) => n.assignedTo).length;
  const unassignedCount = phoneNumbers.length - assignedCount;
  const twilioCount = phoneNumbers.filter((n) => n.provider === "TWILIO").length;

  const tabs: { id: Tab; label: string; icon: typeof Phone; count?: number }[] = [
    { id: "numbers", label: "Numbers", icon: Phone, count: phoneNumbers.length },
    { id: "providers", label: "Providers", icon: Server, count: providers.length },
    { id: "consent", label: "Consent", icon: ShieldCheck, count: consentPolicy ? 1 : 0 },
    { id: "recording", label: "Recording", icon: Mic },
    { id: "twilio", label: "Twilio", icon: Cloud },
  ];

  return (
    <div className="pb-6">
      {/* Summary strip */}
      <MobileSummaryStrip
        stats={[
          { label: "Total", value: String(phoneNumbers.length) },
          { label: "Assigned", value: String(assignedCount) },
          { label: "Unassigned", value: String(unassignedCount), tone: unassignedCount > 0 ? "signal" : undefined },
          { label: "Twilio", value: String(twilioCount) },
        ]}
      />

      {/* Tab bar — scrollable horizontal */}
      <div
        className="flex gap-1 overflow-x-auto rounded-[0.625rem] border p-1 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { haptic(10); setTab(t.id); }}
              className={`flex items-center gap-1.5 rounded-[0.5rem] px-3 py-2 text-m-label font-semibold whitespace-nowrap transition-colors ${
                active ? "" : "press"
              }`}
              style={active
                ? { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
                : { color: "var(--color-ink-500)" }}
            >
              <Icon className="size-3.5" />
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className="rounded px-1 text-m-caption"
                  style={active
                    ? { backgroundColor: "color-mix(in srgb, var(--color-paper) 20%, transparent)" }
                    : { backgroundColor: "var(--color-concrete)" }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "numbers" && <NumbersTab numbers={phoneNumbers} members={members} canManage={canManage} />}
      {tab === "providers" && <ProvidersTab providers={providers} canManage={canManage} />}
      {tab === "consent" && <ConsentTab policy={consentPolicy} company={company} canManage={canManage} />}
      {tab === "recording" && <RecordingTab company={company} members={recordingMembers} canManage={canManage} />}
      {tab === "twilio" && <MobileTwilioTab />}
    </div>
  );
}

// ── Numbers Tab ──
function NumbersTab({ numbers, members, canManage }: { numbers: PhoneNumber[]; members: Member[]; canManage: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignMemberId, setAssignMemberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  async function assignNumber(numberId: string, userId: string) {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/telephony/numbers/${numberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignToUserId: userId }),
      });
      if (res.ok) {
        toast.success("Number assigned");
        haptic();
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not assign");
        haptic([10,50,10]);
      }
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
    setAssigningId(null);
  }

  async function unassignNumber(numberId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/telephony/numbers/${numberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unassign: true }),
      });
      if (res.ok) {
        toast.success("Number unassigned");
        haptic();
        window.location.reload();
      } else {
        toast.error("Could not unassign");
      }
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
  }

  async function deleteNumber(numberId: string) {
    const ok = await confirm({
      title: "Remove this company number?",
      description: "Call history is preserved.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/telephony/numbers/${numberId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Number removed");
        haptic();
        window.location.reload();
      } else {
        toast.error("Could not remove");
      }
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
  }

  if (numbers.length === 0) {
    return (
      <MobileNoResults
        title="No company numbers"
        hint="Add a phone number to start tracking calls."
      />
    );
  }

  return (
    <>
    <div className="space-y-2">
      {numbers.map((n) => {
        const expanded = expandedId === n.id;
        const isAssigning = assigningId === n.id;
        return (
          <Card key={n.id} className="p-3">
            {/* Top row: number + status */}
            <button
              onClick={() => { haptic(10); setExpandedId(expanded ? null : n.id); }}
              className="w-full flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="grid place-items-center size-8 rounded-full shrink-0"
                  style={{ backgroundColor: "var(--color-concrete)" }}
                >
                  <Phone className="size-4" style={{ color: "var(--color-ink-600)" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {n.phoneNumber}
                  </p>
                  {n.label && (
                    <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                      {n.label}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge tone={n.status === "ACTIVE" ? "go" : "neutral"}>
                  {n.status}
                </Badge>
                {n.provider === "TWILIO" && (
                  <Badge tone="signal">Twilio</Badge>
                )}
                {expanded
                  ? <ChevronUp className="size-4" style={{ color: "var(--color-ink-400)" }} />
                  : <ChevronDown className="size-4" style={{ color: "var(--color-ink-400)" }} />}
              </div>
            </button>

            {/* Expanded details */}
            {expanded && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-line)" }}>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Type</p>
                    <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-900)" }}>
                      {n.numberType}
                    </p>
                  </div>
                  <div>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Calls</p>
                    <p className="text-m-label font-semibold tabular-nums" style={{ color: "var(--color-ink-900)" }}>
                      {n._count.calls}
                    </p>
                  </div>
                  <div>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Assigned</p>
                    <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-900)" }}>
                      {n.assignedTo ? n.assignedTo.name : "—"}
                    </p>
                  </div>
                </div>

                {/* Assignment */}
                {canManage && (
                  <div className="space-y-2">
                    {n.assignedTo ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="md"
                          fullWidth
                          onClick={() => unassignNumber(n.id)}
                          disabled={loading}
                        >
                          <UserMinus className="size-4" />
                          Unassign from {n.assignedTo.name}
                        </Button>
                        <Button
                          variant="danger"
                          size="md"
                          onClick={() => deleteNumber(n.id)}
                          disabled={loading}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : isAssigning ? (
                      <div>
                        <p className="text-m-caption mb-1.5" style={{ color: "var(--color-ink-500)" }}>
                          Assign to:
                        </p>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <MobileSelectWithCreate
                              label="Team member"
                              value={assignMemberId}
                              onChange={(v) => {
                                setAssignMemberId(v);
                                assignNumber(n.id, v);
                              }}
                              placeholder="Select a team member…"
                              options={members.map((m) => ({
                                value: m.id,
                                label: m.name,
                                sub: m.role,
                              }))}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="md"
                            onClick={() => setAssigningId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="signal"
                        size="md"
                        fullWidth
                        onClick={() => { haptic(10); setAssigningId(n.id); }}
                        disabled={loading}
                      >
                        <Plus className="size-4" />
                        Assign to a team member
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
    {confirmDialog}
    </>
  );
}

// ── Providers Tab ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProvidersTab({ providers, canManage }: { providers: Provider[]; canManage: boolean }) {
  if (providers.length === 0) {
    return (
      <MobileNoResults
        title="No provider configured"
        hint="Add a provider to enable automatic call tracking via webhooks."
      />
    );
  }

  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Card key={p.id} className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="grid place-items-center size-8 rounded-full shrink-0"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <Server className="size-4" style={{ color: "var(--color-ink-600)" }} />
              </div>
              <div>
                <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {p.provider}
                </p>
                <p className="text-m-caption truncate max-w-[200px]" style={{ color: "var(--color-ink-500)" }}>
                  {p.webhookUrl}
                </p>
              </div>
            </div>
            <Badge tone={p.active ? "go" : "neutral"}>
              {p.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Recording Tab ──
function RecordingTab({ company, members, canManage }: { company: CompanyConfig; members: RecordingMember[]; canManage: boolean }) {
  const [mode, setMode] = useState(company.recordingMode);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(members.filter((m) => m.recordCalls).map((m) => m.userId)),
  );
  const [saving, setSaving] = useState(false);

  const activeMembers = members.filter((m) => m.active);

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/telephony/recording-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingMode: mode,
          selectedUserIds: mode === "SELECTED" ? Array.from(selected) : [],
        }),
      });
      if (res.ok) {
        toast.success("Recording settings saved");
        haptic();
      } else {
        toast.error("Could not save settings");
      }
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  }

  const modeOptions = [
    { value: "ALL", label: "Everyone", icon: Mic, desc: "Record all calls from all staff" },
    { value: "SELECTED", label: "Selected", icon: Mic, desc: "Only record specific people you choose" },
    { value: "NONE", label: "Off", icon: MicOff, desc: "No calls are recorded" },
  ];

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <Card className="p-3">
        <SectionHead title="Recording Mode" />
        <div className="space-y-2">
          {modeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                disabled={!canManage}
                onClick={() => { haptic(10); setMode(opt.value); }}
                className={`w-full flex items-center gap-3 rounded-[0.5rem] border-2 p-3 text-left transition-colors ${
                  active ? "" : canManage ? "press" : ""
                }`}
                style={{
                  borderColor: active ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: active ? "var(--color-concrete)" : "transparent",
                }}
              >
                <div
                  className="grid place-items-center size-8 rounded-full shrink-0"
                  style={{ backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)" }}
                >
                  <Icon className="size-4" style={{ color: active ? "var(--color-paper)" : "var(--color-ink-500)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {opt.label}
                  </p>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {opt.desc}
                  </p>
                </div>
                {active && (
                  <CheckCircle2 className="size-5 shrink-0" style={{ color: "var(--color-go)" }} />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* User selection — only in SELECTED mode */}
      {mode === "SELECTED" && (
        <Card className="p-3">
          <SectionHead
            title="Select People to Record"
            action={
              <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {selected.size}/{activeMembers.length}
              </span>
            }
          />
          {activeMembers.length === 0 ? (
            <p className="text-m-caption py-4 text-center" style={{ color: "var(--color-ink-500)" }}>
              No active staff members.
            </p>
          ) : (
            <div className="space-y-1">
              {activeMembers.map((m) => {
                const isSelected = selected.has(m.userId);
                return (
                  <button
                    key={m.userId}
                    disabled={!canManage}
                    onClick={() => { haptic(10); toggleUser(m.userId); }}
                    className="w-full flex items-center gap-3 rounded-[0.375rem] p-2.5 text-left press"
                    style={{ backgroundColor: isSelected ? "var(--color-concrete)" : "transparent" }}
                  >
                    <div
                      className="grid place-items-center size-5 rounded-[0.25rem] border-2 shrink-0"
                      style={{
                        borderColor: isSelected ? "var(--color-go)" : "var(--color-line)",
                        backgroundColor: isSelected ? "var(--color-go)" : "transparent",
                      }}
                    >
                      {isSelected && <CheckCircle2 className="size-3" style={{ color: "var(--color-paper)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {m.name}
                      </p>
                    </div>
                    <Badge tone="steel">{m.role}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Storage info */}
      <Card className="p-3">
        <SectionHead title="Storage & Retention" />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Consent beep</span>
            <Badge tone={company.recordingConsentBeep ? "go" : "neutral"}>
              {company.recordingConsentBeep ? "On" : "Off"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Retention</span>
            <span className="text-m-label font-semibold" style={{ color: "var(--color-ink-900)" }}>
              {company.recordingRetentionDays}d
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Auto-delete</span>
            <Badge tone={company.recordingAutoDelete ? "go" : "neutral"}>
              {company.recordingAutoDelete ? "Yes" : "No"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Storage</span>
            <span className="text-m-label font-semibold capitalize" style={{ color: "var(--color-ink-900)" }}>
              {company.recordingStorageProvider}
            </span>
          </div>
        </div>
      </Card>

      {/* Save button */}
      {canManage && (
        <Button
          variant="primary"
          size="md"
          fullWidth
          onClick={save}
          disabled={saving}
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save Recording Settings
        </Button>
      )}
    </div>
  );
}

// ── Consent Tab ──
function ConsentTab({ policy, company, canManage }: { policy: ConsentPolicy | null; company: CompanyConfig; canManage: boolean }) {
  return (
    <div className="space-y-3">
      {/* Recording config */}
      <Card className="p-3">
        <SectionHead title="Recording Configuration" />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Consent beep</span>
            <Badge tone={company.recordingConsentBeep ? "go" : "neutral"}>
              {company.recordingConsentBeep ? "On" : "Off"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Retention</span>
            <span className="text-m-label font-semibold" style={{ color: "var(--color-ink-900)" }}>
              {company.recordingRetentionDays}d
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Auto-delete</span>
            <Badge tone={company.recordingAutoDelete ? "go" : "neutral"}>
              {company.recordingAutoDelete ? "Yes" : "No"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-m-label" style={{ color: "var(--color-ink-500)" }}>Storage</span>
            <span className="text-m-label font-semibold" style={{ color: "var(--color-ink-900)" }}>
              {company.recordingStorageProvider}
            </span>
          </div>
        </div>
      </Card>

      {/* Consent policy */}
      <Card className="p-3">
        <SectionHead
          title="Consent Policy"
          action={canManage ? (
            <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Manage on desktop
            </span>
          ) : undefined}
        />
        {policy ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Badge tone="steel">v{policy.version}</Badge>
              <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {new Date(policy.effectiveAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
              </span>
              <span className="inline-flex items-center gap-1 text-m-caption" style={{ color: "var(--color-go)" }}>
                <CheckCircle2 className="size-3" />
                {policy._count.acceptances} accepted
              </span>
            </div>
            <div
              className="max-h-[30vh] overflow-y-auto rounded-[0.5rem] p-3"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <pre className="whitespace-pre-wrap break-words text-m-caption leading-relaxed" style={{ color: "var(--color-ink-900)" }}>
                {policy.policyText}
              </pre>
            </div>
          </>
        ) : (
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            No consent policy published. Create one on desktop to ensure legal compliance.
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Twilio Tab (mobile) ──
function MobileTwilioTab() {
  const [status, setStatus] = useState<{
    configured: boolean;
    account?: { friendlyName: string; status: string; type: string };
    numbers?: {
      sid: string;
      phoneNumber: string;
      friendlyName: string | null;
      synced: boolean;
      webhookConfigured: boolean;
    }[];
    syncedNumbers?: { id: string; phoneNumber: string; providerNumberId: string; label: string | null; status: string }[];
    syncedCount?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [webhookLoadingId, setWebhookLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telephony/twilio/status");
      if (res.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Could not fetch Twilio status.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Network error.");
    }
    setLoading(false);
  }

  async function syncNumbers() {
    setSyncing(true);
    try {
      const res = await fetch("/api/telephony/twilio/sync-numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configureWebhooks: true }) });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.synced ?? 0} numbers`);
        haptic();
        fetchStatus();
      } else {
        toast.error(data.error ?? "Sync failed");
      }
    } catch {
      toast.error("Network error");
    }
    setSyncing(false);
  }

  async function syncCalls() {
    setSyncing(true);
    try {
      const res = await fetch("/api/telephony/twilio/sync-calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.total ?? 0} calls (${data.created ?? 0} new, ${data.updated ?? 0} updated)`);
        haptic();
      } else {
        toast.error(data.error ?? "Sync failed");
      }
    } catch {
      toast.error("Network error");
    }
    setSyncing(false);
  }

  async function toggleWebhook(companyPhoneId: string, action: "configure" | "clear") {
    setWebhookLoadingId(companyPhoneId);
    try {
      const res = await fetch("/api/telephony/twilio/configure-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyPhoneId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(action === "configure" ? "Webhook configured" : "Webhook cleared");
        haptic();
        fetchStatus();
      } else {
        toast.error(data.error ?? "Failed");
      }
    } catch {
      toast.error("Network error");
    }
    setWebhookLoadingId(null);
  }

  // Fetch on mount — the API enforces owner-only access (returns 403 otherwise)
  useEffect(() => {
    fetchStatus();
  }, []);

  if (accessDenied) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="size-5" style={{ color: "var(--color-signal-dark)" }} />
          <h3 className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Owner Access Only
          </h3>
        </div>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          The Twilio integration is restricted to the company owner.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-400)" }} />
      </div>
    );
  }

  if (error && !status) {
    return (
      <Card className="p-4">
        <p className="text-m-caption" style={{ color: "var(--color-stop)" }}>{error}</p>
        <Button variant="secondary" size="md" className="mt-2" onClick={fetchStatus}>
          Retry
        </Button>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Cloud className="size-5" style={{ color: "var(--color-ink-400)" }} />
          <h3 className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Twilio Not Configured
          </h3>
        </div>
        <p className="text-m-caption mb-2" style={{ color: "var(--color-ink-500)" }}>
          Add these environment variables to the server:
        </p>
        <pre
          className="rounded-[0.5rem] p-2 text-m-caption overflow-x-auto"
          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-600)" }}
        >
{`TWILIO_ACCOUNT_SID=ACxxx...
TWILIO_AUTH_TOKEN=xxx...`}
        </pre>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Account info */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="grid place-items-center size-8 rounded-full"
            style={{ backgroundColor: "var(--color-signal-wash)" }}
          >
            <Cloud className="size-4" style={{ color: "var(--color-signal-dark)" }} />
          </div>
          <div className="flex-1">
            <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
              {status.account?.friendlyName ?? "Twilio Account"}
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {status.account?.type} · {status.account?.status}
            </p>
          </div>
          <Badge tone="go">Connected</Badge>
        </div>
      </Card>

      {/* Stats */}
      <MobileSummaryStrip
        stats={[
          { label: "Twilio #s", value: String(status.numbers?.length ?? 0) },
          { label: "Synced", value: String(status.syncedCount ?? 0) },
        ]}
      />

      {/* Numbers list with webhook toggle */}
      {status.numbers && status.numbers.length > 0 && (
        <Card className="p-3">
          <SectionHead title="Phone Numbers" />
          <div className="space-y-2">
            {status.numbers.map((n) => {
              const syncedPhone = status.syncedNumbers?.find((s) => s.providerNumberId === n.sid);
              return (
                <div key={n.sid} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-900)" }}>
                      {n.phoneNumber}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge tone={n.synced ? "go" : "neutral"}>
                        {n.synced ? "Synced" : "Not synced"}
                      </Badge>
                      <Badge tone={n.webhookConfigured ? "go" : "signal"}>
                        {n.webhookConfigured ? "Webhook OK" : "No webhook"}
                      </Badge>
                    </div>
                  </div>
                  {syncedPhone && (
                    <Button
                      variant={n.webhookConfigured ? "ghost" : "signal"}
                      size="md"
                      onClick={() => toggleWebhook(syncedPhone.id, n.webhookConfigured ? "clear" : "configure")}
                      disabled={webhookLoadingId === syncedPhone.id}
                    >
                      {webhookLoadingId === syncedPhone.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : n.webhookConfigured ? "Clear" : "Set webhook"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Sync actions */}
      <div className="space-y-2">
        <Button variant="signal" size="lg" fullWidth onClick={syncNumbers} disabled={syncing}>
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
          Sync Numbers + Webhooks
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={syncCalls} disabled={syncing}>
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <PhoneIncoming className="size-4" />}
          Sync Recent Calls
        </Button>
      </div>
    </div>
  );
}
