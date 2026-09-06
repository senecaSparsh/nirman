"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/lib/use-confirm";
import { TwilioTab } from "@/components/calls/twilio-tab";
import {
  Page,
  Section,
  StatusPill,
  Hint,
} from "@/components/page";
import { PageHeader } from "@/components/page-header";
import {
  Phone,
  Plus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ShieldCheck,
  AlertCircle,
  Loader2,
  Trash2,
  UserMinus,
  Server,
  FileText,
  CheckCircle2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Cloud,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  phoneNormalized: string;
  numberType: string;
  provider: string | null;
  department: string | null;
  label: string | null;
  status: string;
  monthlyCost: string | null;
  acquiredAt: string;
  consentBeep: boolean | null;
  assignedTo: { id: string; name: string } | null;
  _count: { calls: number };
}

interface Provider {
  id: string;
  provider: string;
  webhookUrl: string;
  active: boolean;
  createdAt: string;
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
  recordingMode: string; // ALL | SELECTED | NONE
  passwordMinLength: number;
  accountLockoutThreshold: number;
  accountLockoutDurationMin: number;
}

interface RecordingMember {
  userId: string;
  name: string;
  role: string;
  active: boolean;
  recordCalls: boolean;
}

interface TelephonyViewProps {
  company: CompanyConfig;
  phoneNumbers: PhoneNumber[];
  providers: Provider[];
  consentPolicy: ConsentPolicy | null;
  members: Member[];
  recordingMembers: RecordingMember[];
  canManage: boolean;
}

type Tab = "numbers" | "providers" | "consent" | "recording" | "twilio";

export function TelephonyView({
  company,
  phoneNumbers: initialNumbers,
  providers: initialProviders,
  consentPolicy: initialPolicy,
  members,
  recordingMembers: initialRecordingMembers,
  canManage,
}: TelephonyViewProps) {
  const [tab, setTab] = useState<Tab>("numbers");
  const [phoneNumbers] = useState(initialNumbers);
  const [providers] = useState(initialProviders);
  const [consentPolicy] = useState(initialPolicy);

  const assignedCount = phoneNumbers.filter((n) => n.assignedTo).length;
  const unassignedCount = phoneNumbers.length - assignedCount;
  const twilioCount = phoneNumbers.filter((n) => n.provider === "TWILIO").length;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "numbers", label: "Numbers", count: phoneNumbers.length },
    { id: "providers", label: "Providers", count: providers.length },
    { id: "consent", label: "Consent", count: consentPolicy ? 1 : 0 },
    { id: "recording", label: "Recording" },
    { id: "twilio", label: "Twilio" },
  ];

  return (
    <Page>
      <PageHeader
        title="Telephony"
        description="Company phone numbers, call recording, providers & consent policy"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Telephony" }]}
        stats={[
          { label: "Numbers", value: phoneNumbers.length },
          { label: "Assigned", value: assignedCount, tone: "success" },
          ...(unassignedCount > 0
            ? [{ label: "Unassigned", value: unassignedCount, tone: "warning" as const }]
            : []),
          ...(twilioCount > 0
            ? [{ label: "Twilio", value: twilioCount, tone: "muted" as const }]
            : []),
        ]}
      />

      {/* Tab bar — uses SubNav visual language but client-side */}
      <nav className="-mx-1 overflow-x-auto border-b border-border scrollbar-none no-print">
        <div className="flex min-w-full items-stretch gap-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 pb-2.5 pt-2 text-[13px] transition-colors duration-100 ${
                tab === t.id
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none ${
                    tab === t.id ? "bg-brand-soft text-brand-strong" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.count}
                </span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {tab === "numbers" && <NumbersTab numbers={phoneNumbers} members={members} canManage={canManage} />}
      {tab === "providers" && <ProvidersTab providers={providers} canManage={canManage} />}
      {tab === "consent" && <ConsentTab policy={consentPolicy} company={company} canManage={canManage} />}
      {tab === "recording" && <RecordingTab company={company} members={initialRecordingMembers} canManage={canManage} />}
      {tab === "twilio" && <TwilioTab />}
    </Page>
  );
}

// ── Numbers Tab ──
function NumbersTab({ numbers, members, canManage }: { numbers: PhoneNumber[]; members: Member[]; canManage: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("VIRTUAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  async function addNumber() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telephony/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: newNumber, label: newLabel, numberType: newType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not add number.");
        setLoading(false);
        return;
      }
      setShowAdd(false);
      setNewNumber("");
      setNewLabel("");
      window.location.reload();
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  async function assignNumber(numberId: string, userId: string) {
    if (!userId) return;
    await fetch(`/api/telephony/numbers/${numberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignToUserId: userId }),
    });
    window.location.reload();
  }

  async function unassignNumber(numberId: string) {
    await fetch(`/api/telephony/numbers/${numberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unassign: true }),
    });
    window.location.reload();
  }

  async function deleteNumber(numberId: string) {
    const ok = await confirm({
      title: "Remove this company number?",
      description: "Call history is preserved. The number will be unassigned and marked as recycled.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/telephony/numbers/${numberId}`, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Section
          title="Company Numbers"
          description="Phone numbers assigned to your team for call tracking"
          action={
            <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="h-4 w-4" />
              Add number
            </Button>
          }
        >
          {showAdd && (
            <div className="border-b border-border bg-subtle p-4 space-y-3">
              <h3 className="text-body font-medium text-foreground">Add a company phone number</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Phone number</Label>
                  <Input type="tel" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="space-y-1.5">
                  <Label>Label (optional)</Label>
                  <Input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Reception, Site office…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={newType} onChange={(e) => setNewType(e.target.value)}>
                    <option value="VIRTUAL">Virtual</option>
                    <option value="MOBILE">Mobile (SIM)</option>
                    <option value="LANDLINE">Landline</option>
                    <option value="TOLL_FREE">Toll-free</option>
                  </Select>
                </div>
              </div>
              {error && (
                <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption text-danger">
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={addNumber} disabled={loading || !newNumber.trim()}>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {numbers.length === 0 ? (
            <EmptyState
              icon={<Phone />}
              title="No company numbers yet"
              description="Add a phone number to start tracking calls."
              size="compact"
            />
          ) : (
            <table className="w-full text-body">
              <thead className="sticky top-0 z-10 bg-subtle backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border-strong">
                <tr>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Number</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Type</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Assigned to</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Status</th>
                  <th className="h-9 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground">Calls</th>
                  {canManage && <th className="h-9 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {numbers.map((n) => (
                  <tr key={n.id} className="group border-b border-border transition-colors last:border-0 hover:bg-subtle">
                    <td className="px-3 py-2.5 align-middle">
                      <p className="font-medium text-foreground">{n.phoneNumber}</p>
                      <div className="flex items-center gap-1.5">
                        {n.label && <p className="text-caption text-muted-foreground">{n.label}</p>}
                        {n.provider === "TWILIO" && <Badge variant="brand" size="sm">Twilio</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-caption text-muted-foreground">{n.numberType}</td>
                    <td className="px-3 py-2.5 align-middle">
                      {n.assignedTo ? (
                        <span className="text-foreground">{n.assignedTo.name}</span>
                      ) : canManage ? (
                        <Select
                          value=""
                          onChange={(e) => assignNumber(n.id, e.target.value)}
                          className="text-caption"
                        >
                          <option value="">Unassigned — assign…</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <StatusPill status={n.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right align-middle tabular-nums text-muted-foreground">{n._count.calls}</td>
                    {canManage && (
                      <td className="w-px whitespace-nowrap px-3 py-1.5 text-right align-middle [&>*]:opacity-0 [&>*]:transition-opacity group-hover:[&>*]:opacity-100 group-focus-within:[&>*]:opacity-100">
                        <div className="flex justify-end gap-1">
                          {n.assignedTo && (
                            <button onClick={() => unassignNumber(n.id)} title="Unassign" className="text-muted-foreground hover:text-foreground">
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => deleteNumber(n.id)} title="Remove" className="text-danger hover:opacity-70">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {!canManage && numbers.length === 0 && (
        <Section title="Company Numbers">
          <EmptyState
            icon={<Phone />}
            title="No company numbers yet"
            description="Add a phone number to start tracking calls."
            size="compact"
          />
        </Section>
      )}

      {!canManage && numbers.length > 0 && (
        <Section title="Company Numbers" description="Phone numbers assigned to your team for call tracking">
          <table className="w-full text-body">
            <thead className="sticky top-0 z-10 bg-subtle backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border-strong">
              <tr>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Number</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Type</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Assigned to</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Status</th>
                <th className="h-9 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground">Calls</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {numbers.map((n) => (
                <tr key={n.id} className="border-b border-border transition-colors last:border-0 hover:bg-subtle">
                  <td className="px-3 py-2.5 align-middle">
                    <p className="font-medium text-foreground">{n.phoneNumber}</p>
                    <div className="flex items-center gap-1.5">
                      {n.label && <p className="text-caption text-muted-foreground">{n.label}</p>}
                      {n.provider === "TWILIO" && <Badge variant="brand" size="sm">Twilio</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle text-caption text-muted-foreground">{n.numberType}</td>
                  <td className="px-3 py-2.5 align-middle">
                    {n.assignedTo ? <span className="text-foreground">{n.assignedTo.name}</span> : <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2.5 align-middle"><StatusPill status={n.status} /></td>
                  <td className="px-3 py-2.5 text-right align-middle tabular-nums text-muted-foreground">{n._count.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {confirmDialog}
    </div>
  );
}

// ── Providers Tab ──
function ProvidersTab({ providers, canManage }: { providers: Provider[]; canManage: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const [provider, setProvider] = useState("EXOTEL");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function addProvider() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telephony/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, apiSecret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not add provider.");
        setLoading(false);
        return;
      }
      setShowAdd(false);
      setApiKey("");
      setApiSecret("");
      window.location.reload();
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Section
        title="Telephony Providers"
        description="Cloud providers that automatically track and record calls via webhooks"
        action={canManage ? (
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4" />
            Add provider
          </Button>
        ) : undefined}
      >
        {showAdd && (
          <div className="border-b border-border bg-subtle p-4 space-y-3">
            <h3 className="text-body font-medium text-foreground">Configure a telephony provider</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="EXOTEL">Exotel</option>
                  <option value="KNOWLARITY">Knowlarity</option>
                  <option value="TWILIO">Twilio</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>API Key / SID</Label>
                <Input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your provider API key" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>API Secret / Token</Label>
                <Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Your provider API secret" />
              </div>
            </div>
            {error && (
              <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption text-danger">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={addProvider} disabled={loading || !apiKey || !apiSecret}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {providers.length === 0 ? (
          <EmptyState
            icon={<Server />}
            title="No telephony provider configured"
            description="Add a provider to enable automatic call tracking via webhooks."
            size="compact"
          />
        ) : (
          <table className="w-full text-body">
            <thead className="sticky top-0 z-10 bg-subtle backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border-strong">
              <tr>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Provider</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Webhook URL</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-subtle">
                  <td className="px-3 py-2.5 align-middle font-medium text-foreground">{p.provider}</td>
                  <td className="px-3 py-2.5 align-middle text-caption text-muted-foreground">
                    <span className="block truncate max-w-xs">{p.webhookUrl}</span>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    {p.active ? (
                      <Badge variant="success" dot>Active</Badge>
                    ) : (
                      <Badge variant="muted" dot>Inactive</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
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
  const [saved, setSaved] = useState(false);

  const activeMembers = members.filter((m) => m.active);
  const selectedCount = selected.size;

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(activeMembers.map((m) => m.userId)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function save() {
    setSaving(true);
    setSaved(false);
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
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    }
    setSaving(false);
  }

  const modeOptions = [
    {
      value: "ALL",
      label: "Record everyone",
      description: "All calls from all staff members are recorded automatically.",
    },
    {
      value: "SELECTED",
      label: "Record selected people",
      description: "Only calls from specific staff members you choose are recorded.",
    },
    {
      value: "NONE",
      label: "Recording off",
      description: "No calls are recorded. Existing recordings are retained per policy.",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Recording mode selector */}
      <Section
        title="Recording Mode"
        description="Choose which staff members have their calls recorded"
        action={canManage ? (
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-caption text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
            <Button size="sm" onClick={save} disabled={saving || mode === company.recordingMode && mode !== "SELECTED"}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        ) : undefined}
      >
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
          {modeOptions.map((opt) => (
            <button
              key={opt.value}
              disabled={!canManage}
              onClick={() => setMode(opt.value)}
              className={`bg-card p-4 text-left transition-colors ${
                mode === opt.value ? "ring-2 ring-inset ring-brand" : canManage ? "hover:bg-subtle" : "cursor-default"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-4 place-items-center rounded-full border ${
                    mode === opt.value ? "border-brand bg-brand" : "border-border"
                  }`}
                >
                  {mode === opt.value && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                <p className="text-body font-medium text-foreground">{opt.label}</p>
              </div>
              <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* User selection — only shown when mode is SELECTED */}
      {mode === "SELECTED" && (
        <Section
          title="Select People to Record"
          description={`${selectedCount} of ${activeMembers.length} active staff selected`}
          action={canManage ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={selectAll}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={selectNone}>Clear</Button>
            </div>
          ) : undefined}
        >
          {activeMembers.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No active staff members"
              description="Add team members to enable selective recording."
              size="compact"
            />
          ) : (
            <div className="divide-y divide-border">
              {activeMembers.map((m) => (
                <label
                  key={m.userId}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    canManage ? "cursor-pointer hover:bg-subtle" : "cursor-default"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.userId)}
                    disabled={!canManage}
                    onChange={() => toggleUser(m.userId)}
                    className="size-4 rounded border-border text-brand focus:ring-brand"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-medium text-foreground">{m.name}</p>
                  </div>
                  <Badge variant="muted" size="sm">{m.role}</Badge>
                  {selected.has(m.userId) && (
                    <Badge variant="success" dot>Recording</Badge>
                  )}
                </label>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Storage & retention summary */}
      <Section title="Storage & Retention" description="How recordings are stored and how long they're kept">
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {[
            { label: "Consent beep", value: company.recordingConsentBeep ? "On" : "Off", tone: company.recordingConsentBeep ? "success" : "muted" as const },
            { label: "Retention", value: `${company.recordingRetentionDays}d` },
            { label: "Auto-delete", value: company.recordingAutoDelete ? "Yes" : "No", tone: company.recordingAutoDelete ? "success" : "muted" as const },
            { label: "Storage", value: company.recordingStorageProvider },
          ].map((item) => (
            <div key={item.label} className="bg-card p-4">
              <p className="text-label text-muted-foreground">{item.label}</p>
              <p className={`mt-1 text-[13px] font-semibold leading-none ${
                item.tone === "success" ? "text-success" : item.tone === "muted" ? "text-muted-foreground" : "text-foreground"
              }`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Consent Tab ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ConsentTab({ policy, company, canManage }: { policy: ConsentPolicy | null; company: CompanyConfig; canManage: boolean }) {
  const [showEdit, setShowEdit] = useState(false);
  const [policyText, setPolicyText] = useState(policy?.policyText ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function savePolicy() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telephony/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyText }),
      });
      if (!res.ok) {
        setError("Could not save policy.");
        setLoading(false);
        return;
      }
      setShowEdit(false);
      window.location.reload();
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Consent policy */}
      <Section
        title="Call Monitoring Consent Policy"
        description="The legal text shown to all staff on login before call recording is enabled"
        action={canManage ? (
          <Button size="sm" variant="outline" onClick={() => setShowEdit(!showEdit)}>
            <FileText className="h-3.5 w-3.5" />
            {policy ? "Revise" : "Create"}
          </Button>
        ) : undefined}
      >
        <div className="p-4 space-y-3">
          {policy ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="default">v{policy.version}</Badge>
                <span className="text-caption text-muted-foreground">
                  {new Date(policy.effectiveAt).toLocaleDateString("en-IN")}
                </span>
                <Badge variant="success" dot>
                  {policy._count.acceptances} accepted
                </Badge>
              </div>
              <div className="rounded-md bg-accent/30 p-3">
                <pre className="whitespace-pre-wrap break-words text-caption leading-relaxed text-foreground">
                  {policy.policyText}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-caption text-muted-foreground">
              No consent policy published. Create one to ensure legal compliance before enabling call recording.
            </p>
          )}
        </div>
      </Section>

      {/* Edit form */}
      {showEdit && (
        <Section title={policy ? "Revise consent policy" : "Create consent policy"}>
          <div className="p-4 space-y-3">
            {policy && (
              <Hint>
                Revising creates a new version. All staff must re-accept on next login.
              </Hint>
            )}
            <Textarea
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              placeholder="Enter the full consent policy text. This will be shown to all staff on login…"
              rows={6}
            />
            {error && (
              <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption text-danger">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={savePolicy} disabled={loading || !policyText.trim()}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {policy ? "Publish new version" : "Publish policy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
