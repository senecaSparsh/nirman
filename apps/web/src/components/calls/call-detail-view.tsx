"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useConfirm } from "@/lib/use-confirm";
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
  ShieldCheck,
  AlertCircle,
  Loader2,
  Voicemail,
  ArrowLeft,
  Clock,
  User,
  Tag as TagIcon,
} from "lucide-react";

interface CallDetail {
  id: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  status: string;
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

interface CallDetailViewProps {
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

export function CallDetailView({
  call,
  canViewFullNumber,
  canEdit,
  canListenRecording,
  canDelete,
  canManage,
}: CallDetailViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState(call.callNotes);
  const [tags, setTags] = useState(call.tags);
  const [disposition, setDisposition] = useState(call.disposition ?? "");
  const [notes2, setNotes2] = useState(call.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [legalHold, setLegalHold] = useState(call.legalHold);
  const [confirm, confirmDialog] = useConfirm();

  const isStaffCaller = !!call.caller;
  const otherParty = isStaffCaller ? call.toNumber : call.fromNumber;
  const staffName = call.caller?.name ?? call.callee?.name ?? "Unassigned";

  function togglePlay() {
    if (!call.recording || !canListenRecording) return;
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
    setError("");
    try {
      const res = await fetch(`/api/calls/${call.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      if (!res.ok) {
        setError("Could not add note.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setNotes([{ ...data.note }, ...notes]);
      setNewNote("");
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  async function addTag() {
    if (!newTag.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/calls/${call.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTag.trim() }),
      });
      if (!res.ok) {
        setError("Could not add tag.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setTags([...tags, { callTag: data.tag }]);
      setNewTag("");
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  async function removeTag(tagId: string) {
    try {
      await fetch(`/api/calls/${call.id}/tags?tagId=${tagId}`, { method: "DELETE" });
      setTags(tags.filter((t) => t.callTag.id !== tagId));
    } catch {}
  }

  async function saveDisposition() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition, notes: notes2 }),
      });
      if (!res.ok) {
        setError("Could not save.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  async function toggleLegalHold() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalHold: !legalHold }),
      });
      if (!res.ok) {
        setError("Could not toggle legal hold.");
        setLoading(false);
        return;
      }
      setLegalHold(!legalHold);
    } catch {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link href="/calls" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to call log
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            {call.direction === "INBOUND" && <PhoneIncoming className="h-5 w-5 text-success" />}
            {call.direction === "OUTBOUND" && <PhoneOutgoing className="h-5 w-5 text-brand" />}
            {call.direction === "INTERNAL" && <Phone className="h-5 w-5 text-muted-foreground" />}
            <h1 className="text-title text-foreground">
              {call.direction === "INBOUND" ? "Incoming" : call.direction === "OUTBOUND" ? "Outgoing" : "Internal"} Call
            </h1>
            {legalHold && (
              <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-2 py-0.5 text-micro font-medium text-warning">
                <ShieldAlert className="h-3 w-3" />
                Legal Hold
              </span>
            )}
          </div>
          <p className="mt-1 text-meta text-muted-foreground">
            {formatDateTime(call.startedAt)} · {formatDuration(call.durationSec)} · {call.source === "MANUAL" ? "Manually logged" : call.source === "AUTO" ? "Auto-tracked" : "App"}
          </p>
        </div>
      </div>

      {/* Call info grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Parties */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-body font-medium text-foreground">Parties</h3>
          <div className="space-y-2 text-caption">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">From</span>
              <span className="font-medium text-foreground">{maskNumber(call.fromNumber, canViewFullNumber)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">To</span>
              <span className="font-medium text-foreground">{maskNumber(call.toNumber, canViewFullNumber)}</span>
            </div>
            {call.companyPhone && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Company number</span>
                <span className="font-medium text-foreground">{call.companyPhone.phoneNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Staff</span>
              <span className="font-medium text-foreground">{staffName}</span>
            </div>
          </div>
        </div>

        {/* Status & timing */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-body font-medium text-foreground">Status & Timing</h3>
          <div className="space-y-2 text-caption">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium text-foreground">{call.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Ring time</span>
              <span className="font-medium text-foreground">{formatDuration(call.ringDurationSec)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Talk time</span>
              <span className="font-medium text-foreground">{formatDuration(call.durationSec)}</span>
            </div>
            {call.callCost && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-medium text-foreground">₹{call.callCost}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Consent beep</span>
              <span className="font-medium text-foreground">
                {call.recordingConsent ? (
                  <span className="inline-flex items-center gap-1 text-success"><ShieldCheck className="h-3 w-3" /> Played</span>
                ) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recording player */}
      {call.recording && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-medium text-foreground">Recording</h3>
            {canListenRecording && (
              <span className="text-micro text-muted-foreground">
                {call.recording.accessCount} plays · Expires {call.recording.expiresAt ? formatDateTime(call.recording.expiresAt) : "never"}
              </span>
            )}
          </div>
          {canListenRecording ? (
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={togglePlay}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <a href={`/api/calls/${call.id}/recording`} download>
                <Button type="button" size="sm" variant="ghost">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </a>
              <span className="text-caption text-muted-foreground">
                {formatDuration(call.recording.durationSec)} · {call.recording.format.toUpperCase()}
                {call.recording.fileSizeBytes && ` · ${(call.recording.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`}
              </span>
            </div>
          ) : (
            <p className="text-caption text-muted-foreground">You don&apos;t have permission to listen to recordings.</p>
          )}
          {/* Transcript */}
          {call.recording.transcriptStatus === "COMPLETED" && call.recording.transcriptText && (
            <div className="rounded-md bg-accent/30 p-3">
              <p className="mb-1 text-micro font-medium text-muted-foreground">Transcript</p>
              <p className="whitespace-pre-wrap text-caption leading-relaxed text-foreground">{call.recording.transcriptText}</p>
            </div>
          )}
        </div>
      )}

      {/* Voicemail */}
      {call.voicemail && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Voicemail className="h-4 w-4 text-brand" />
            <h3 className="text-body font-medium text-foreground">Voicemail</h3>
            <span className="text-micro text-muted-foreground">{formatDuration(call.voicemail.durationSec)}</span>
          </div>
          {canListenRecording && (
            <audio controls className="w-full">
              <source src={call.voicemail.audioUrl} />
            </audio>
          )}
          {call.voicemail.transcription && (
            <div className="rounded-md bg-accent/30 p-3">
              <p className="mb-1 text-micro font-medium text-muted-foreground">Transcription</p>
              <p className="whitespace-pre-wrap text-caption leading-relaxed text-foreground">{call.voicemail.transcription}</p>
            </div>
          )}
        </div>
      )}

      {/* Disposition & notes (editable) */}
      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-body font-medium text-foreground">Disposition & Notes</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-micro">Disposition</Label>
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
            <div>
              <Label className="mb-1 block text-micro">Primary note</Label>
              <Input
                type="text"
                value={notes2}
                onChange={(e) => setNotes2(e.target.value)}
                placeholder="Call summary…"
              />
            </div>
          </div>
          <Button size="sm" onClick={saveDisposition} disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      )}

      {/* Tags */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-body font-medium text-foreground">Tags</h3>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <span className="text-caption text-muted-foreground">No tags yet.</span>}
          {tags.map((t) => (
            <span
              key={t.callTag.id}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-micro font-medium"
              style={{ backgroundColor: t.callTag.color + "20", color: t.callTag.color }}
            >
              {t.callTag.name}
              {canEdit && (
                <button onClick={() => removeTag(t.callTag.id)} className="ml-0.5 hover:opacity-70">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag…"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            />
            <Button size="sm" variant="outline" onClick={addTag} disabled={loading || !newTag.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Notes timeline */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-body font-medium text-foreground">Notes ({notes.length})</h3>
        {notes.length === 0 && <p className="text-caption text-muted-foreground">No notes yet.</p>}
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-md bg-accent/30 p-3">
              <div className="flex items-center justify-between text-micro text-muted-foreground">
                <span className="font-medium">{n.user.name}</span>
                <span>{formatDateTime(n.createdAt)}</span>
              </div>
              <p className="mt-1 text-caption text-foreground">{n.note}</p>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note…"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
            />
            <Button size="sm" variant="outline" onClick={addNote} disabled={loading || !newNote.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Admin actions */}
      {canManage && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-body font-medium text-foreground">Admin Actions</h3>
          <Button size="sm" variant="outline" onClick={toggleLegalHold} disabled={loading}>
            <ShieldAlert className="h-3.5 w-3.5" />
            {legalHold ? "Release legal hold" : "Place legal hold"}
          </Button>
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              className="ml-2 text-danger"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete this call?",
                  description: "The recording will be permanently purged. This is for GDPR compliance — the call record cannot be recovered.",
                  confirmLabel: "Delete",
                  variant: "destructive",
                });
                if (!ok) return;
                await fetch(`/api/calls/${call.id}`, { method: "DELETE" });
                window.location.href = "/calls";
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete (GDPR)
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption text-danger">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {confirmDialog}
    </div>
  );
}
