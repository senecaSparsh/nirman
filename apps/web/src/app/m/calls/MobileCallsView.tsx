"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  PhoneIncoming, PhoneOutgoing, Phone,
  Play, ShieldAlert, Voicemail, Clock,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import { Card, Badge } from "@/components/mobile/v2/primitives";
import { useHydratedDate } from "@/lib/use-hydrated-date";

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
  source: string;
  legalHold: boolean;
  recording: { id: string; durationSec: number } | null;
  voicemail: { id: string } | null;
  companyPhone: { id: string; phoneNumber: string; label: string | null } | null;
  caller: { id: string; name: string } | null;
  callee: { id: string; name: string } | null;
  tags: { callTag: { id: string; name: string; color: string } }[];
};

interface Props {
  calls: CallRow[];
  phoneNumbers: { id: string; phoneNumber: string; label: string | null }[];
  canViewAll: boolean;
  canViewFullNumber: boolean;
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

function formatRelative(iso: string, now: Date | null): string {
  const d = new Date(iso);
  if (!now) return formatDate(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

function statusTone(status: CallStatus): "go" | "stop" | "signal" | "neutral" {
  switch (status) {
    case "ANSWERED": return "go";
    case "MISSED":
    case "FAILED":
    case "REJECTED": return "stop";
    case "VOICEMAIL": return "signal";
    default: return "neutral";
  }
}

export function MobileCallsView({
  calls,
  phoneNumbers,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canViewAll,
  canViewFullNumber,
  canListenRecording,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phoneFilter, setPhoneFilter] = useState<string>("all");
  const now = useHydratedDate();

  const filtered = useMemo(() => {
    let result = calls;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const otherParty = c.direction === "INBOUND" ? c.fromNumber : c.toNumber;
        const staff = c.caller?.name ?? c.callee?.name ?? "";
        return (
          otherParty.toLowerCase().includes(q) ||
          staff.toLowerCase().includes(q) ||
          (c.companyPhone?.phoneNumber ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (phoneFilter !== "all") {
      result = result.filter((c) => c.companyPhone?.id === phoneFilter);
    }
    return result;
  }, [calls, search, statusFilter, phoneFilter]);

  const missedCount = calls.filter((c) => c.status === "MISSED").length;
  const answeredCount = calls.filter((c) => c.status === "ANSWERED").length;
  const voicemailCount = calls.filter((c) => c.status === "VOICEMAIL").length;

  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "MISSED", label: `Missed${missedCount ? ` (${missedCount})` : ""}` },
    { value: "ANSWERED", label: "Answered" },
    { value: "VOICEMAIL", label: "Voicemail" },
    { value: "FAILED", label: "Failed" },
  ];

  const phoneOptions = [
    { value: "all", label: "All numbers" },
    ...phoneNumbers.map((p) => ({ value: p.id, label: p.label ?? p.phoneNumber })),
  ];

  return (
    <div className="pb-6">
      {/* Summary */}
      <MobileSummaryStrip
        stats={[
          { label: "Total", value: String(calls.length) },
          { label: "Answered", value: String(answeredCount), tone: "go" },
          { label: "Missed", value: String(missedCount), tone: missedCount > 0 ? "stop" : undefined },
          { label: "Voicemail", value: String(voicemailCount), tone: voicemailCount > 0 ? "signal" : undefined },
        ]}
      />

      {/* Search + filters integrated */}
      <MobileSearchHeader
        placeholder="Search by number or name…"
        query={search}
        onQueryChange={setSearch}
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={statusOptions}
              active={statusFilter}
              defaultValue="all"
              onChange={setStatusFilter}
            />
            {phoneNumbers.length > 1 && (
              <MobileFilterIcon
                options={phoneOptions}
                active={phoneFilter}
                defaultValue="all"
                onChange={setPhoneFilter}
              />
            )}
          </div>
        }
        showClear={statusFilter !== "all" || phoneFilter !== "all" || !!search}
        onClear={() => { setSearch(""); setStatusFilter("all"); setPhoneFilter("all"); }}
      />

      {/* Call list */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No calls found"
          hint={search || statusFilter !== "all" || phoneFilter !== "all"
            ? "Try adjusting your filters."
            : "Calls will appear here once a provider is configured."}
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((call) => (
            <CallCard
              key={call.id}
              call={call}
              canViewFullNumber={canViewFullNumber}
              canListenRecording={canListenRecording}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CallCard({
  call,
  canViewFullNumber,
  canListenRecording,
  now,
}: {
  call: CallRow;
  canViewFullNumber: boolean;
  canListenRecording: boolean;
  now: Date | null;
}) {
  const otherParty = call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
  const staffName = call.caller?.name ?? call.callee?.name ?? "—";
  const isMissed = call.status === "MISSED";
  const isVoicemail = call.status === "VOICEMAIL";

  const iconColor = isMissed
    ? "var(--color-stop)"
    : isVoicemail
      ? "var(--color-signal-dark)"
      : call.direction === "INBOUND"
        ? "var(--color-go)"
        : "var(--color-ink-600)";

  const iconBg = isMissed
    ? "var(--color-stop-wash)"
    : isVoicemail
      ? "var(--color-signal-wash)"
      : "var(--color-concrete)";

  return (
    <Link
      href={`/m/calls/${call.id}`}
      onClick={() => haptic(10)}
      className="block"
    >
      <Card className="p-2.5">
        <div className="flex items-center gap-2.5">
          {/* Direction icon */}
          <div
            className="grid place-items-center size-9 rounded-full shrink-0"
            style={{ backgroundColor: iconBg }}
          >
            {call.direction === "INBOUND" && <PhoneIncoming className="size-4" style={{ color: iconColor }} />}
            {call.direction === "OUTBOUND" && <PhoneOutgoing className="size-4" style={{ color: iconColor }} />}
            {call.direction === "INTERNAL" && <Phone className="size-4" style={{ color: iconColor }} />}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p
                className="text-m-body font-bold truncate"
                style={{ color: isMissed ? "var(--color-stop)" : "var(--color-ink-950)" }}
              >
                {maskNumber(otherParty, canViewFullNumber)}
              </p>
              {call.legalHold && (
                <ShieldAlert className="size-3.5 shrink-0" style={{ color: "var(--color-stop)" }} />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                {staffName}
              </p>
              {call.companyPhone && (
                <>
                  <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>·</span>
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                    {call.companyPhone.label ?? call.companyPhone.phoneNumber}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Right side: status + time */}
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <Badge tone={statusTone(call.status)}>
              {call.status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
            <div className="flex items-center gap-1">
              {call.recording && canListenRecording && (
                <Play className="size-3" style={{ color: "var(--color-signal-dark)" }} />
              )}
              {call.voicemail && (
                <Voicemail className="size-3" style={{ color: "var(--color-signal-dark)" }} />
              )}
              <span className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-400)" }}>
                {formatRelative(call.startedAt, now)}
              </span>
            </div>
            {call.durationSec > 0 && (
              <div className="flex items-center gap-0.5">
                <Clock className="size-2.5" style={{ color: "var(--color-ink-300)" }} />
                <span className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-400)" }}>
                  {formatDuration(call.durationSec)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        {call.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
            {call.tags.map((t) => (
              <span
                key={t.callTag.id}
                className="rounded px-1.5 py-0.5 text-m-caption font-medium"
                style={{
                  backgroundColor: `${t.callTag.color}20`,
                  color: t.callTag.color,
                }}
              >
                {t.callTag.name}
              </span>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
