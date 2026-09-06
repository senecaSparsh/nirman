"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
  Play,
  Download,
  Pause,
  Plus,
  Trash2,
  ShieldAlert,
  AlertCircle,
  Loader2,
  Voicemail,
  Clock,
  User,
  Tag as TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import {
  MobileSectionTitle,
  MobileStatCard,
  Badge,
  ActionBar,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

type CallDirection = "INBOUND" | "OUTBOUND" | "INTERNAL";
type CallStatus = "RINGING" | "ANSWERED" | "MISSED" | "BUSY" | "REJECTED" | "FAILED" | "VOICEMAIL";

interface CallDetail {
  id: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  startedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  ringDurationSec: number;
  disposition: string | null;
  notes: string | null;
  source: string;
  legalHold: boolean;
  callCost: string | null;
  provider: string | null;
  providerCallId: string | null;
  recordingConsent: boolean;
  relatedProjectId: string | null;
  companyPhone: { id: string; phoneNumber: string; label: string | null } | null;
  caller: { id: string; name: string; email: string } | null;
  callee: { id: string; name: string; email: string } | null;
  recording: {
    id: string;
    storageUrl: string;
    format: string;
    durationSec: number;
    fileSizeBytes: number | null;
    transcriptText: string | null;
    transcriptStatus: string;
    uploadedAt: string;
    expiresAt: string | null;
    accessCount: number;
  } | null;
  voicemail: { id: string; audioUrl: string; durationSec: number; transcription: string | null } | null;
  callNotes: { id: string; note: string; createdAt: string; user: { id: string; name: string } }[];
  tags: { callTag: { id: string; name: string; color: string } }[];
}

interface Props {
  call: CallDetail;
  canViewFullNumber: boolean;
  canEdit: boolean;
  canListenRecording: boolean;
  canDelete: boolean;
  canManage: boolean;
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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

function statusColor(status: CallStatus): string {
  switch (status) {
    case "ANSWERED": return "var(--color-go)";
    case "MISSED":
    case "FAILED":
    case "REJECTED": return "var(--color-stop)";
    case "VOICEMAIL": return "var(--color-signal)";
    default: return "var(--color-steel)";
  }
}

export function MobileCallDetailClient({
  call,
  canViewFullNumber,
  canEdit,
  canListenRecording,
  canDelete,
  canManage,
}: Props) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState(call.callNotes);
  const [tags, setTags] = useState(call.tags);
  const [disposition, setDisposition] = useState(call.disposition ?? "");
  const [notes2, setNotes2] = useState(call.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [legalHold, setLegalHold] = useState(call.legalHold);
  const [showDelete, setShowDelete] = useState(false);
  const [showDisposition, setShowDisposition] = useState(false);

  const staffName = call.caller?.name ?? call.callee?.name ?? "Unassigned";
  const tone = statusTone(call.status);
  const sColor = statusColor(call.status);

  const iconColor = call.status === "MISSED"
    ? "var(--color-stop)"
    : call.status === "VOICEMAIL"
      ? "var(--color-signal-dark)"
      : call.direction === "INBOUND"
        ? "var(--color-go)"
        : "var(--color-ink-600)";

  const iconBg = call.status === "MISSED"
    ? "var(--color-stop-wash)"
    : call.status === "VOICEMAIL"
      ? "var(--color-signal-wash)"
      : "var(--color-concrete)";

  function togglePlay() {
    if (!call.recording || !canListenRecording) return;
    haptic(10);
    if (isPlaying) {
      audioEl?.pause();
      setIsPlaying(false);
    } else {
      if (!audioEl) {
        const el = new Audio(`/api/calls/${call.id}/recording`);
        el.onended = () => setIsPlaying(false);
        setAudioEl(el);
        el.play();
      } else {
        audioEl.play();
      }
      setIsPlaying(true);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      if (!res.ok) {
        toast.error("Could not add note.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setNotes([{ ...data.note }, ...notes]);
      setNewNote("");
      haptic(10);
    } catch {
      toast.error("Could not reach the server.");
    }
    setLoading(false);
  }

  async function addTag() {
    if (!newTag.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTag.trim() }),
      });
      if (!res.ok) {
        toast.error("Could not add tag.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setTags([...tags, { callTag: data.tag }]);
      setNewTag("");
      haptic(10);
    } catch {
      toast.error("Could not reach the server.");
    }
    setLoading(false);
  }

  async function removeTag(tagId: string) {
    try {
      await fetch(`/api/calls/${call.id}/tags?tagId=${tagId}`, { method: "DELETE" });
      setTags(tags.filter((t) => t.callTag.id !== tagId));
    } catch (e) {
      console.error("Failed to remove tag", e);
      toast.error("Could not remove tag.");
    }
  }

  async function saveDisposition() {
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition, notes: notes2 }),
      });
      if (!res.ok) {
        toast.error("Could not save.");
        setLoading(false);
        return;
      }
      toast.success("Saved");
      haptic(10);
      setShowDisposition(false);
    } catch {
      toast.error("Could not reach the server.");
    }
    setLoading(false);
  }

  async function toggleLegalHold() {
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalHold: !legalHold }),
      });
      if (!res.ok) {
        toast.error("Could not toggle legal hold.");
        setLoading(false);
        return;
      }
      setLegalHold(!legalHold);
      haptic(10);
    } catch {
      toast.error("Could not reach the server.");
    }
    setLoading(false);
  }

  async function deleteCall() {
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete call.");
        setLoading(false);
        return;
      }
      haptic(20);
      toast.success("Call deleted");
      router.push("/m/calls");
    } catch {
      toast.error("Could not reach the server.");
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* ── Header banner ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        {/* Color strip */}
        <div className="h-1 w-full" style={{ backgroundColor: sColor }} />

        <div className="flex items-start gap-3 p-3.5">
          {/* Direction icon */}
          <div
            className="grid place-items-center size-11 rounded-full shrink-0"
            style={{ backgroundColor: iconBg }}
          >
            {call.direction === "INBOUND" && <PhoneIncoming className="size-5" style={{ color: iconColor }} />}
            {call.direction === "OUTBOUND" && <PhoneOutgoing className="size-5" style={{ color: iconColor }} />}
            {call.direction === "INTERNAL" && <Phone className="size-5" style={{ color: iconColor }} />}
          </div>

          {/* Title + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-m-section font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
                {call.direction === "INBOUND" ? "Incoming" : call.direction === "OUTBOUND" ? "Outgoing" : "Internal"} Call
              </h1>
              {legalHold && (
                <ShieldAlert className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
              )}
            </div>
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {formatDateTime(call.startedAt)} · {formatDuration(call.durationSec)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge tone={tone}>{call.status}</Badge>
              <span
                className="text-m-caption font-semibold px-2 py-0.5 rounded-[0.25rem]"
                style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
              >
                {call.source === "MANUAL" ? "Manual" : call.source === "AUTO" ? "Auto" : "App"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <MobileStatCard
          label="Talk Time"
          value={formatDuration(call.durationSec)}
          icon={Clock}
        />
        <MobileStatCard
          label="Ring Time"
          value={formatDuration(call.ringDurationSec)}
          icon={Phone}
        />
        <MobileStatCard
          label="Cost"
          value={call.callCost ? `₹${call.callCost}` : "—"}
          icon={User}
          tone="signal"
        />
      </div>

      {/* ── Parties ── */}
      <div>
        <MobileSectionTitle>Parties</MobileSectionTitle>
        <div
          className="rounded-[0.625rem] border overflow-hidden"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="grid grid-cols-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div className="p-2.5">
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>From</p>
              <p className="text-m-label font-bold tabular-nums truncate" style={{ color: "var(--color-ink-950)" }}>
                {maskNumber(call.fromNumber, canViewFullNumber)}
              </p>
            </div>
            <div className="p-2.5" style={{ borderLeft: "1px solid var(--color-line)" }}>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>To</p>
              <p className="text-m-label font-bold tabular-nums truncate" style={{ color: "var(--color-ink-950)" }}>
                {maskNumber(call.toNumber, canViewFullNumber)}
              </p>
            </div>
          </div>
          {call.companyPhone && (
            <div className="grid grid-cols-2" style={{ borderTop: "1px solid var(--color-line)" }}>
              <div className="p-2.5">
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Company Number</p>
                <p className="text-m-label font-bold tabular-nums truncate" style={{ color: "var(--color-ink-950)" }}>
                  {call.companyPhone.phoneNumber}
                </p>
              </div>
              <div className="p-2.5" style={{ borderLeft: "1px solid var(--color-line)" }}>
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Staff</p>
                <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {staffName}
                </p>
              </div>
            </div>
          )}
          {!call.companyPhone && (
            <div className="p-2.5" style={{ borderTop: "1px solid var(--color-line)" }}>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Staff</p>
              <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                {staffName}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recording ── */}
      {call.recording && (
        <div>
          <MobileSectionTitle
            right={canListenRecording ? (
              <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {call.recording.accessCount} plays
              </span>
            ) : undefined}
          >
            Recording
          </MobileSectionTitle>
          {canListenRecording ? (
            <div
              className="rounded-[0.625rem] border p-3"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="grid place-items-center size-10 rounded-full press shrink-0"
                  style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
                >
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <a
                  href={`/api/calls/${call.id}/recording`}
                  download
                  className="grid place-items-center size-10 rounded-full border press shrink-0"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  <Download className="size-4" />
                </a>
                <div className="min-w-0">
                  <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>
                    {formatDuration(call.recording.durationSec)} · {call.recording.format.toUpperCase()}
                  </p>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {call.recording.fileSizeBytes && `${(call.recording.fileSizeBytes / 1024 / 1024).toFixed(1)} MB · `}
                    {call.recording.expiresAt ? `Expires ${formatDateTime(call.recording.expiresAt)}` : "No expiry"}
                  </p>
                </div>
              </div>
              {call.recording.transcriptStatus === "COMPLETED" && call.recording.transcriptText && (
                <div className="mt-2.5 rounded-[0.5rem] p-2.5" style={{ backgroundColor: "var(--color-paper-2)" }}>
                  <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>
                    Transcript
                  </p>
                  <p className="text-m-body leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink-900)" }}>
                    {call.recording.transcriptText}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              className="rounded-[0.625rem] border p-3"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                You don&rsquo;t have permission to listen to recordings.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Voicemail ── */}
      {call.voicemail && (
        <div>
          <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{formatDuration(call.voicemail.durationSec)}</span>}>
            Voicemail
          </MobileSectionTitle>
          <div
            className="rounded-[0.625rem] border p-3 space-y-2.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="flex items-center gap-2">
              <Voicemail className="size-4" style={{ color: "var(--color-signal-dark)" }} />
              <span className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>Voicemail</span>
            </div>
            {canListenRecording && (
              <audio controls className="w-full">
                <source src={call.voicemail.audioUrl} />
              </audio>
            )}
            {call.voicemail.transcription && (
              <div className="rounded-[0.5rem] p-2.5" style={{ backgroundColor: "var(--color-paper-2)" }}>
                <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>
                  Transcription
                </p>
                <p className="text-m-body leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink-900)" }}>
                  {call.voicemail.transcription}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Disposition ── */}
      {canEdit && (
        <div>
          <MobileSectionTitle
            right={
              <button
                type="button"
                onClick={() => setShowDisposition(true)}
                className="text-m-caption font-bold press"
                style={{ color: "var(--color-brand)" }}
              >
                {call.disposition ? "Edit" : "Add"}
              </button>
            }
          >
            Disposition
          </MobileSectionTitle>
          <div
            className="rounded-[0.625rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="grid grid-cols-2">
              <div className="p-2.5">
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Disposition</p>
                <p
                  className="text-m-label font-bold truncate"
                  style={{ color: call.disposition ? "var(--color-go)" : "var(--color-ink-400)" }}
                >
                  {call.disposition
                    ? call.disposition.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
                    : "Not set"}
                </p>
              </div>
              <div className="p-2.5" style={{ borderLeft: "1px solid var(--color-line)" }}>
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Primary Note</p>
                <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {call.notes ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tags ── */}
      <div>
        <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{tags.length}</span>}>
          Tags
        </MobileSectionTitle>
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 && <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>No tags yet.</span>}
            {tags.map((t) => (
              <span
                key={t.callTag.id}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-m-label font-medium"
                style={{ backgroundColor: `${t.callTag.color}20`, color: t.callTag.color }}
              >
                {t.callTag.name}
                {canEdit && (
                  <button type="button" onClick={() => removeTag(t.callTag.id)} className="ml-0.5 press">
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag…"
                className="flex-1 h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{ backgroundColor: "transparent" }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              />
              <button
                type="button"
                onClick={addTag}
                disabled={loading || !newTag.trim()}
                className="inline-flex items-center gap-1 h-10 rounded-[0.5rem] px-3 text-m-body font-bold border press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                <Plus className="size-3.5" />
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Notes timeline ── */}
      <div>
        <MobileSectionTitle right={<span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{notes.length}</span>}>
          Notes
        </MobileSectionTitle>
        <div className="flex flex-col gap-2">
          {notes.length === 0 && (
            <MobileEmptyState
              icon={TagIcon}
              title="No notes yet"
              size="compact"
            />
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-[0.5rem] border p-2.5"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-700)" }}>{n.user.name}</span>
                <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>{formatDateTime(n.createdAt)}</span>
              </div>
              <p className="text-m-body" style={{ color: "var(--color-ink-950)" }}>{n.note}</p>
            </div>
          ))}
          {canEdit && (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note…"
                className="flex-1 h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{ backgroundColor: "transparent" }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
              />
              <button
                type="button"
                onClick={addNote}
                disabled={loading || !newNote.trim()}
                className="inline-flex items-center gap-1 h-10 rounded-[0.5rem] px-3 text-m-body font-bold border press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                <Plus className="size-3.5" />
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete button (inline, above the ActionBar) ── */}
      {canDelete && canManage ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50"
            style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
          >
            <Trash2 className="size-3.5" />
            Delete (GDPR)
          </button>
        </div>
      ) : null}

      {/* ── Sticky bottom action bar ── */}
      {(canEdit || canManage) ? (
        <ActionBar>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <button
                onClick={() => setShowDisposition(true)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
              >
                <TagIcon className="size-4" />
                {call.disposition ? "Edit Disposition" : "Add Disposition"}
              </button>
            ) : null}
            {canManage ? (
              <button
                onClick={toggleLegalHold}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{
                  borderColor: legalHold ? "var(--color-stop)" : "var(--color-signal)",
                  color: legalHold ? "var(--color-stop)" : "var(--color-signal-dark)",
                  backgroundColor: "transparent",
                }}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                {legalHold ? "Release Hold" : "Legal Hold"}
              </button>
            ) : null}
          </div>
        </ActionBar>
      ) : null}

      {/* ── Delete confirmation bottom sheet ── */}
      {showDelete && (
        <MobileDialog open={showDelete} onClose={() => setShowDelete(false)} title="Delete this call?">
          <div className="px-3 pb-4">
              <div
                className="rounded-[0.5rem] p-2.5 mb-3 flex items-start gap-2"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)" }}
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-stop)" }} />
                <p className="text-m-label" style={{ color: "var(--color-ink-700)" }}>
                  The recording will be permanently purged. This is for GDPR compliance — the call record cannot be recovered.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowDelete(false)}
                  disabled={loading}
                  className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={deleteCall}
                  disabled={loading}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete Permanently
                </button>
              </div>
            </div>
        </MobileDialog>
      )}

      {/* ── Disposition editor bottom sheet ── */}
      {showDisposition && (
        <MobileDialog open={showDisposition} onClose={() => setShowDisposition(false)} title="Disposition & Notes">
          <div className="px-3 pb-4 space-y-3">
              <div>
                <EnumSelect
                  label="Disposition"
                  value={disposition}
                  onChange={(v) => setDisposition(v)}
                  placeholder="—"
                  options={[
                    { value: "CONNECTED", label: "Connected" },
                    { value: "VOICEMAIL_LEFT", label: "Voicemail left" },
                    { value: "CALLBACK_REQUESTED", label: "Callback requested" },
                    { value: "FOLLOW_UP", label: "Follow up" },
                    { value: "DEAL_CLOSED", label: "Deal closed" },
                    { value: "COMPLAINT", label: "Complaint" },
                    { value: "INQUIRY", label: "Inquiry" },
                    { value: "OTHER", label: "Other" },
                  ]}
                />
              </div>
              <div>
                <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Primary note
                </label>
                <input
                  type="text"
                  value={notes2}
                  onChange={(e) => setNotes2(e.target.value)}
                  placeholder="Call summary…"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ backgroundColor: "transparent" }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDisposition(false)}
                  className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDisposition}
                  disabled={loading}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
        </MobileDialog>
      )}
    </div>
  );
}
