"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Phone, Mail, Calendar, User, Building2,
  Target, TrendingUp, Clock, MessageSquare,
  CheckCircle2, AlertCircle, ArrowRight,
  Plus, Loader2, X, UserRoundCheck, ChevronDown,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatCard,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileLink as Link } from "@/components/mobile/mobile-link";

interface LeadActivity {
  id: string;
  type: string;
  note: string | null;
  outcome: string | null;
  occurredAt: string;
  nextFollowUpAt: string | null;
}

interface LeadData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  stage: string;
  priority: string;
  score: number;
  budgetMin: number | null;
  budgetMax: number | null;
  interestedUnitType: string | null;
  interestedUnitNumber: string | null;
  projectName: string | null;
  projectId: string | null;
  assignedToName: string | null;
  notes: string | null;
  nextFollowUpAt: string | null;
  lastContactAt: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  convertedCustomerId: string | null;
  convertedCustomerName: string | null;
  createdAt: string;
  activities: LeadActivity[];
  stats: {
    score: number;
    activityCount: number;
    daysSinceContact: number | null;
  };
}

const STAGE_META: Record<string, { color: string; label: string }> = {
  NEW: { color: "var(--color-steel)", label: "New" },
  CONTACTED: { color: "var(--color-info)", label: "Contacted" },
  SITE_VISIT: { color: "var(--color-info)", label: "Site Visit" },
  NEGOTIATION: { color: "var(--color-warn)", label: "Negotiation" },
  BOOKED: { color: "var(--color-go)", label: "Booked" },
  LOST: { color: "var(--color-stop)", label: "Lost" },
};

const PRIORITY_META: Record<string, { color: string; label: string }> = {
  LOW: { color: "var(--color-steel)", label: "Low" },
  MEDIUM: { color: "var(--color-info)", label: "Medium" },
  HIGH: { color: "var(--color-warn)", label: "High" },
  HOT: { color: "var(--color-stop)", label: "Hot" },
};

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  WHATSAPP: MessageSquare,
  MEETING: User,
  SITE_VISIT: Building2,
  NOTE: MessageSquare,
  STAGE_CHANGE: TrendingUp,
};

// Stage progression map — which stages can follow the current one.
const NEXT_STAGES: Record<string, string[]> = {
  NEW: ["CONTACTED", "SITE_VISIT", "NEGOTIATION", "LOST"],
  CONTACTED: ["SITE_VISIT", "NEGOTIATION", "LOST"],
  SITE_VISIT: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["LOST"],
};

export function MobileLeadDetailClient({
  data,
  canCreate: _canCreate,
  canManage,
  notFound,
}: {
  data?: LeadData;
  canCreate: boolean;
  canManage: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [movingStage, setMovingStage] = useState(false);
  const [showStageSheet, setShowStageSheet] = useState(false);
  const [selectedStage, setSelectedStage] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [converting, setConverting] = useState(false);

  if (notFound || !data) {
    return (
      <MobileEmptyState
        icon={AlertCircle}
        title="Lead not found"
        hint="This lead may have been deleted or moved."
      />
    );
  }

  const lead = data;
  const stageMeta = STAGE_META[lead.stage] ?? { color: "var(--color-steel)", label: lead.stage };
  const priorityMeta = PRIORITY_META[lead.priority] ?? { color: "var(--color-steel)", label: lead.priority };
  const isLost = lead.stage === "LOST";
  const isConverted = !!lead.convertedCustomerId;
  const canLogActivity = canManage && !isLost && !isConverted;
  const canConvert = canManage && (lead.stage === "SITE_VISIT" || lead.stage === "NEGOTIATION") && !isConverted;
  const nextStages = NEXT_STAGES[lead.stage] ?? [];

  async function moveStage() {
    if (!selectedStage) return;
    if (selectedStage === "LOST" && !lostReason.trim()) {
      toast.error("Lost reason is required");
      return;
    }
    setMovingStage(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: selectedStage,
          lostReason: selectedStage === "LOST" ? lostReason.trim() : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to move lead");
      toast.success(`Lead moved to ${selectedStage.toLowerCase().replaceAll("_", " ")}`);
      setShowStageSheet(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setMovingStage(false);
    }
  }

  async function convertToCustomer() {
    setConverting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to convert lead");
      toast.success("Lead converted to customer");
      router.push(`/m/customers/${result.customerId}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* ── Header ── */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h1 className="text-m-section font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {lead.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem]"
                style={{ backgroundColor: stageMeta.color, color: "var(--color-paper)" }}
              >
                {stageMeta.label}
              </span>
              <span
                className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem]"
                style={{ backgroundColor: priorityMeta.color, color: "var(--color-paper)" }}
              >
                {priorityMeta.label}
              </span>
              {isConverted ? (
                <span
                  className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem]"
                  style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                >
                  Converted
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-m-caption uppercase font-semibold" style={{ color: "var(--color-ink-500)" }}>
              Score
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {lead.score}
            </p>
          </div>
        </div>

        {/* Quick actions — call + log */}
        <div className="flex items-center gap-2 mt-2">
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-1 text-m-caption font-semibold text-m-body press"
              style={{ color: "var(--color-steel)" }}
            >
              <Phone className="size-3" />
              {lead.phone}
            </a>
          ) : null}
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-1 text-m-caption font-semibold text-m-body press"
              style={{ color: "var(--color-steel)" }}
            >
              <Mail className="size-3" />
              Email
            </a>
          ) : null}
        </div>
      </div>

      {/* ── Log Activity (call tracking) ── */}
      {canLogActivity ? (
        <LogActivityForm leadId={lead.id} />
      ) : null}

      {/* ── Stage progression + convert ── */}
      {canManage && !isLost && !isConverted ? (
        <div className="flex flex-col gap-2">
          {canConvert ? (
            <button
              onClick={convertToCustomer}
              disabled={converting}
              className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {converting ? <Loader2 className="size-3.5 animate-spin" /> : <UserRoundCheck className="size-3.5" />}
              {converting ? "Converting…" : "Convert to Customer"}
            </button>
          ) : null}
          {nextStages.length > 0 ? (
            <button
              onClick={() => {
                setSelectedStage(nextStages[0] ?? "");
                setLostReason("");
                setShowStageSheet(true);
              }}
              className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              <TrendingUp className="size-3" />
              Move to Next Stage
              <ChevronDown className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-1.5">
        <MobileStatCard
          label="Activities"
          value={String(lead.stats.activityCount)}
          icon={MessageSquare}
        />
        <MobileStatCard
          label="Last Contact"
          value={lead.stats.daysSinceContact != null ? `${lead.stats.daysSinceContact}d ago` : "—"}
          icon={Clock}
        />
        <MobileStatCard
          label="Source"
          value={lead.source.replace(/_/g, " ")}
          icon={Target}
          tone="signal"
        />
      </div>

      {/* ── Details ── */}
      <div>
        <MobileSectionTitle>Details</MobileSectionTitle>
        <div className="flex flex-col gap-2.5">
          {lead.budgetMin != null || lead.budgetMax != null ? (
            <MobileRow
              icon={Target}
              title="Budget"
              meta={
                lead.budgetMin != null && lead.budgetMax != null
                  ? `${formatCurrency(lead.budgetMin)} – ${formatCurrency(lead.budgetMax)}`
                  : lead.budgetMin != null
                    ? `From ${formatCurrency(lead.budgetMin)}`
                    : `Up to ${formatCurrency(lead.budgetMax ?? 0)}`
              }
            />
          ) : null}
          {lead.interestedUnitType ? (
            <MobileRow icon={Building2} title="Interested In" meta={lead.interestedUnitType} />
          ) : null}
          {lead.interestedUnitNumber ? (
            <MobileRow icon={Building2} title="Unit" meta={lead.interestedUnitNumber} />
          ) : null}
          {lead.projectName ? (
            <MobileRow
              icon={Building2}
              title="Project"
              meta={lead.projectName}
            />
          ) : null}
          {lead.assignedToName ? (
            <MobileRow icon={User} title="Assigned To" meta={lead.assignedToName} />
          ) : null}
          {lead.nextFollowUpAt ? (
            <MobileRow
              icon={Calendar}
              title="Next Follow-up"
              meta={formatDate(lead.nextFollowUpAt)}
            />
          ) : null}
          {lead.lastContactAt ? (
            <MobileRow
              icon={Clock}
              title="Last Contact"
              meta={formatDate(lead.lastContactAt)}
            />
          ) : null}
          {lead.convertedCustomerName ? (
            <Link
              href={`/m/customers/${lead.convertedCustomerId}`}
              className="flex items-center gap-2"
            >
              <MobileRow
                icon={CheckCircle2}
                title="Converted To"
                meta={lead.convertedCustomerName}
              />
              <ArrowRight className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
            </Link>
          ) : null}
          {isLost && lead.lostReason ? (
            <MobileRow
              icon={AlertCircle}
              title="Lost Reason"
              meta={lead.lostReason}
            />
          ) : null}
        </div>
      </div>

      {/* ── Notes ── */}
      {lead.notes ? (
        <div>
          <MobileSectionTitle>Notes</MobileSectionTitle>
          <div
            className="rounded-[0.5rem] border p-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-label leading-relaxed" style={{ color: "var(--color-ink-700)" }}>
              {lead.notes}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Activity Timeline ── */}
      <div>
        <MobileSectionTitle>Activity Timeline</MobileSectionTitle>
        {lead.activities.length === 0 ? (
          <MobileEmptyState
            icon={MessageSquare}
            title="No activities yet"
            hint="Call, email, and meeting logs will appear here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {lead.activities.map((a) => {
              const Icon = ACTIVITY_ICONS[a.type] ?? MessageSquare;
              return (
                <div
                  key={a.id}
                  className="flex items-start gap-2.5 rounded-[0.5rem] border p-2.5"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div
                    className="grid place-items-center size-7 rounded-[0.375rem] shrink-0"
                    style={{ backgroundColor: "var(--color-concrete)" }}
                  >
                    <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-950)" }}>
                        {a.type.replace(/_/g, " ")}
                      </p>
                      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                        {formatDate(a.occurredAt)}
                      </p>
                    </div>
                    {a.note ? (
                      <p className="text-m-caption mt-0.5 leading-relaxed" style={{ color: "var(--color-ink-700)" }}>
                        {a.note}
                      </p>
                    ) : null}
                    {a.outcome ? (
                      <p className="text-m-caption mt-0.5 italic" style={{ color: "var(--color-steel)" }}>
                        → {a.outcome}
                      </p>
                    ) : null}
                    {a.nextFollowUpAt ? (
                      <p className="text-m-caption mt-1 flex items-center gap-0.5" style={{ color: "var(--color-warn)" }}>
                        <Calendar className="size-2.5" />
                        Follow up: {formatDate(a.nextFollowUpAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Stage progression sheet ── */}
      {showStageSheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowStageSheet(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                Move Lead
              </p>
              <button onClick={() => setShowStageSheet(false)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div>
                <label className="text-m-caption font-semibold block mb-1.5" style={{ color: "var(--color-ink-500)" }}>
                  Next Stage
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {nextStages.map((s) => {
                    const meta = STAGE_META[s] ?? { color: "var(--color-steel)", label: s };
                    const active = selectedStage === s;
                    return (
                      <button
                        key={s}
                        onClick={() => { setSelectedStage(s); setLostReason(""); }}
                        className="rounded-[0.375rem] px-2.5 py-1.5 text-m-caption font-bold text-m-body press"
                        style={{
                          backgroundColor: active ? meta.color : "var(--color-paper-2)",
                          color: active ? "var(--color-paper)" : "var(--color-ink-700)",
                          border: `1px solid ${active ? meta.color : "var(--color-line)"}`,
                        }}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedStage === "LOST" ? (
                <div>
                  <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                    Lost Reason *
                  </label>
                  <input
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    placeholder="Budget, location, competitor…"
                    className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => setShowStageSheet(false)}
                  disabled={movingStage}
                  className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={moveStage}
                  disabled={movingStage || !selectedStage || (selectedStage === "LOST" && !lostReason.trim())}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: movingStage || !selectedStage ? 0.5 : 1 }}
                >
                  {movingStage ? <Loader2 className="size-3.5 animate-spin" /> : "Move Lead"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LogActivityForm — inline call/activity logger on the lead detail page.
   
   The owner's #1 ask for sales: "किससे कॉलिंग हो रही है, किससे क्या हो रहा
   है, किसने क्या बोला" — who was called, what happened, what was said.
   This form lets sales staff log a call (or email/WhatsApp/meeting/note)
   right from the lead profile, with notes, outcome, and next follow-up.
   ═══════════════════════════════════════════════════════════════════════════ */

const ACTIVITY_TYPES = [
  { value: "CALL", label: "Call", icon: Phone },
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageSquare },
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "MEETING", label: "Meeting", icon: User },
  { value: "SITE_VISIT", label: "Site Visit", icon: Building2 },
  { value: "NOTE", label: "Note", icon: MessageSquare },
] as const;

function LogActivityForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("CALL");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim() && !outcome.trim()) {
      toast.error("Add a note or outcome");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          note: note.trim() || undefined,
          outcome: outcome.trim() || undefined,
          nextFollowUpAt: nextFollowUp || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to log activity");
      toast.success("Activity logged");
      // Reset + close
      setNote("");
      setOutcome("");
      setNextFollowUp("");
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to log activity");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    // Quick-action chips — tap to open the form with a pre-selected type
    return (
      <div>
        <MobileSectionTitle>Log Activity</MobileSectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => { setType(t.value); setOpen(true); }}
                className="flex items-center gap-1 rounded-[0.375rem] border px-2.5 py-1.5 text-m-caption font-bold text-m-body press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                  color: "var(--color-ink-700)",
                }}
              >
                <Icon className="size-3" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded form
  return (
    <div
      className="rounded-[0.625rem] border p-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
          Log Activity
        </h3>
        <button
          onClick={() => setOpen(false)}
          className="press grid place-items-center size-6 rounded-[0.25rem]"
          style={{ color: "var(--color-ink-500)" }}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2.5">
        {/* Type selector */}
        <div className="flex flex-wrap gap-1">
          {ACTIVITY_TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className="flex items-center gap-1 rounded-[0.25rem] px-2 py-1 text-m-caption font-bold text-m-body press"
                style={{
                  backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)",
                  color: active ? "var(--color-paper)" : "var(--color-ink-500)",
                }}
              >
                <Icon className="size-2.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Notes — "किसने क्या बोला" */}
        <div>
          <label className="text-m-caption font-bold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>
            Notes — what was discussed
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Client interested in 2BHK, asked for site visit next week"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-m-label font-medium outline-none resize-none"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </div>

        {/* Outcome */}
        <div>
          <label className="text-m-caption font-bold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>
            Outcome
          </label>
          <input
            type="text"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="e.g. Callback scheduled, warm lead"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-m-label font-medium outline-none"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </div>

        {/* Next follow-up */}
        <div>
          <label className="text-m-caption font-bold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>
            Next Follow-up
          </label>
          <input
            type="date"
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-m-label font-medium outline-none"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-1.5 rounded-[0.375rem] py-2.5 text-m-label font-bold text-m-body press disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-ink-950)",
            color: "var(--color-paper)",
          }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {saving ? "Saving…" : "Log Activity"}
        </button>
      </form>
    </div>
  );
}
