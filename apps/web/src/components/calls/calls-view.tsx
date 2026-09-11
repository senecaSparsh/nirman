"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  Page,
  Section,
  Toolbar,
  ToolbarCount,
  ToolbarDivider,
  StatusPill,
} from "@/components/page";
import { PageHeader } from "@/components/page-header";
import {
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
  Play,
  Search,
  Plus,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Voicemail,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";

type CallStatus = "RINGING" | "ANSWERED" | "MISSED" | "BUSY" | "REJECTED" | "FAILED" | "VOICEMAIL";
type Direction = "INBOUND" | "OUTBOUND" | "INTERNAL";

type CallRow = {
  id: string;
  direction: Direction;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  startedAt: string;
  durationSec: number;
  disposition: string | null;
  notes: string | null;
  source: string;
  legalHold: boolean;
  companyPhoneId: string | null;
  callerUserId: string | null;
  calleeUserId: string | null;
  relatedProjectId: string | null;
  recording: { id: string; durationSec: number; transcriptStatus: string } | null;
  voicemail: { id: string } | null;
  companyPhone: { id: string; phoneNumber: string; label: string | null } | null;
  caller: { id: string; name: string } | null;
  callee: { id: string; name: string } | null;
  tags: { callTag: { id: string; name: string; color: string } }[];
};

type PhoneNumber = { id: string; phoneNumber: string; label: string | null; department: string | null };
type Tag = { id: string; name: string; color: string };

interface CallsViewProps {
  calls: CallRow[];
  phoneNumbers: PhoneNumber[];
  tags: Tag[];
  canViewAll: boolean;
  canViewFullNumber: boolean;
  canCreate: boolean;
  canListenRecording: boolean;
}

function maskNumber(num: string, showFull: boolean): string {
  if (showFull || num.length <= 4) return num;
  return "*****" + num.slice(-4);
}

function formatDuration(sec: number): string {
  if (sec === 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function directionIcon(dir: Direction) {
  switch (dir) {
    case "INBOUND": return <PhoneIncoming className="h-3.5 w-3.5 text-success" />;
    case "OUTBOUND": return <PhoneOutgoing className="h-3.5 w-3.5 text-brand" />;
    case "INTERNAL": return <Phone className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function CallsView({
  calls: initialCalls,
  phoneNumbers,
  canViewFullNumber,
  canCreate,
  canListenRecording,
}: CallsViewProps) {
  const [calls] = useState(initialCalls);
  const [search, setSearch] = useState("");
  const [filterDirection, setFilterDirection] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPhone, setFilterPhone] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const fromMatch = c.fromNumber.includes(search);
        const toMatch = c.toNumber.includes(search);
        const nameMatch =
          c.caller?.name.toLowerCase().includes(q) ||
          c.callee?.name.toLowerCase().includes(q) ||
          c.notes?.toLowerCase().includes(q);
        if (!fromMatch && !toMatch && !nameMatch) return false;
      }
      if (filterDirection && c.direction !== filterDirection) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterPhone && c.companyPhoneId !== filterPhone) return false;
      return true;
    });
  }, [calls, search, filterDirection, filterStatus, filterPhone]);

  const missedCount = calls.filter((c) => c.status === "MISSED").length;
  const totalDuration = calls.reduce((sum, c) => sum + c.durationSec, 0);

  return (
    <Page>
      <PageHeader
        title="Call Log"
        description="Incoming, outgoing, and internal calls across all company numbers"
        breadcrumbs={[{ label: "Calls" }]}
        stats={[
          { label: "Total", value: calls.length },
          { label: "Missed", value: missedCount, tone: missedCount > 0 ? "danger" : "muted" },
          { label: "Talk time", value: formatDuration(totalDuration), tone: "muted" },
        ]}
        action={canCreate ? (
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4" />
            Log Call
          </Button>
        ) : undefined}
      />

      {/* Manual call log form */}
      {showAddForm && (
        <ManualCallForm
          phoneNumbers={phoneNumbers}
          onClose={() => setShowAddForm(false)}
          onSaved={() => {
            setShowAddForm(false);
            window.location.reload();
          }}
        />
      )}

      {/* Filters */}
      <Section bare>
        <Toolbar>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by number, name, or notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <ToolbarDivider />
          <Select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)} className="w-auto">
            <option value="">All directions</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
            <option value="INTERNAL">Internal</option>
          </Select>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-auto">
            <option value="">All statuses</option>
            <option value="ANSWERED">Answered</option>
            <option value="MISSED">Missed</option>
            <option value="VOICEMAIL">Voicemail</option>
            <option value="FAILED">Failed</option>
          </Select>
          <Select value={filterPhone} onChange={(e) => setFilterPhone(e.target.value)} className="w-auto">
            <option value="">All numbers</option>
            {phoneNumbers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.phoneNumber} {p.label ? `(${p.label})` : ""}
              </option>
            ))}
          </Select>
          <ToolbarCount>{filteredCalls.length} of {calls.length} calls</ToolbarCount>
        </Toolbar>

        {/* Call list */}
        {filteredCalls.length === 0 ? (
          <div className="overflow-hidden rounded-b-lg border border-t-0 border-border bg-card shadow-raised">
            <EmptyState
              icon={<Phone />}
              title="No calls found"
              description={
                calls.length === 0
                  ? "Calls will appear here once they're logged or received."
                  : "Try adjusting your filters."
              }
              size="compact"
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-b-lg border border-t-0 border-border bg-card shadow-raised">
            <table className="w-full text-body">
              <thead className="sticky top-0 z-10 bg-subtle backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border-strong">
                <tr>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Direction</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">From → To</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Staff</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Status</th>
                  <th className="h-9 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground">Duration</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Time</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Recording</th>
                  <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Tags</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {filteredCalls.map((call) => {
                  const isStaffCaller = !!call.callerUserId;
                  const otherParty = isStaffCaller ? call.toNumber : call.fromNumber;
                  const staffName = call.caller?.name ?? call.callee?.name ?? "—";
                  return (
                    <tr key={call.id} className="group border-b border-border transition-colors last:border-0 hover:bg-subtle">
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          {directionIcon(call.direction)}
                          {call.legalHold && <ShieldAlert className="h-3 w-3 text-warning" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <Link href={`/calls/${call.id}`} className="font-medium text-foreground hover:underline">
                          {maskNumber(otherParty, canViewFullNumber)}
                        </Link>
                        {call.companyPhone && (
                          <p className="text-caption text-muted-foreground">via {call.companyPhone.phoneNumber}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-muted-foreground">{staffName}</td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-1">
                          <StatusPill status={call.status} />
                          {call.voicemail && <Voicemail className="h-3 w-3 text-brand" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle tabular-nums text-muted-foreground">
                        {formatDuration(call.durationSec)}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-caption text-muted-foreground">{formatDate(call.startedAt)}</td>
                      <td className="px-3 py-2.5 align-middle">
                        {call.recording && canListenRecording ? (
                          <Link href={`/calls/${call.id}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                            <Play className="h-3 w-3" />
                            Play
                          </Link>
                        ) : call.recording ? (
                          <span className="text-caption text-muted-foreground">Recorded</span>
                        ) : (
                          <span className="text-caption text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {call.tags.map((t) => (
                            <span
                              key={t.callTag.id}
                              className="inline-flex rounded px-1.5 py-0.5 text-micro font-medium"
                              style={{ backgroundColor: t.callTag.color + "20", color: t.callTag.color }}
                            >
                              {t.callTag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Page>
  );
}

// ── Manual call log form ──
function ManualCallForm({
  phoneNumbers,
  onClose,
  onSaved,
}: {
  phoneNumbers: PhoneNumber[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState("OUTBOUND");
  const [otherNumber, setOtherNumber] = useState("");
  const [companyPhoneId, setCompanyPhoneId] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          otherNumber,
          companyPhoneId: companyPhoneId || undefined,
          durationSec: parseInt(durationSec) || 0,
          disposition: disposition || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not log the call. Try again.");
        setLoading(false);
        return;
      }
      onSaved();
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  return (
    <Section title="Log a call manually" action={<Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="OUTBOUND">Outbound</option>
              <option value="INBOUND">Inbound</option>
              <option value="INTERNAL">Internal (staff-to-staff)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Other party number</Label>
            <Input
              type="tel"
              value={otherNumber}
              onChange={(e) => setOtherNumber(e.target.value)}
              placeholder="98765 43210"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Company number (optional)</Label>
            <Select value={companyPhoneId} onChange={(e) => setCompanyPhoneId(e.target.value)}>
              <option value="">—</option>
              {phoneNumbers.map((p) => (
                <option key={p.id} value={p.id}>{p.phoneNumber}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Duration (seconds)</Label>
            <Input
              type="number"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              placeholder="0"
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Disposition</Label>
            <Select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
              <option value="">—</option>
              <option value="CONNECTED">Connected</option>
              <option value="VOICEMAIL_LEFT">Voicemail left</option>
              <option value="CALLBACK_REQUESTED">Callback requested</option>
              <option value="FOLLOW_UP">Follow up</option>
              <option value="DEAL_CLOSED">Deal closed</option>
              <option value="COMPLAINT">Complaint</option>
              <option value="INQUIRY">Inquiry</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call summary…"
            />
          </div>
        </div>
        {error && (
          <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption text-danger">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        <Button type="submit" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Saving…" : "Log call"}
        </Button>
      </form>
    </Section>
  );
}
