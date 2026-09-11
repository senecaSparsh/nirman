"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ContactRound, FolderOpen, CheckCircle2, Plus, Eye } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileProjectSelect } from "@/components/mobile/selectors";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";
import { useMobileBack } from "@/components/mobile/v2/mobile-back-button";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { SmartDefaultsBadge } from "@/components/mobile/v2/smart-defaults-badge";

const SOURCES = [
  ["PORTAL", "Property portal"],
  ["WALK_IN", "Walk-in"],
  ["REFERRAL", "Referral"],
  ["BROKER", "Broker"],
  ["DIGITAL_AD", "Digital ad"],
  ["OTHER", "Other"],
] as const;

const UNIT_TYPES = [
  ["", "Any type"],
  ["1BHK", "1 BHK"],
  ["2BHK", "2 BHK"],
  ["3BHK", "3 BHK"],
  ["4BHK", "4 BHK"],
  ["SHOP", "Shop"],
  ["OFFICE", "Office"],
  ["WAREHOUSE", "Warehouse unit"],
  ["VILLA", "Villa"],
  ["PLOT", "Plot"],
  ["OTHER", "Other"],
] as const;

const PRIORITIES = [
  ["LOW", "Low"],
  ["MEDIUM", "Medium"],
  ["HIGH", "High"],
  ["HOT", "Hot"],
] as const;

interface ProjectItem { id: string; name: string }
interface UnitItem { id: string; projectId: string; projectName: string; label: string }
interface AssigneeItem { id: string; name: string }

export function MobileNewLeadClient({
  projects,
  units,
  assignees,
  currentUserId,
  onClose,
  onCreated,
}: {
  projects: ProjectItem[];
  units: UnitItem[];
  assignees: AssigneeItem[];
  currentUserId?: string | null;
  /** When provided, the form closes this modal on success instead of navigating. */
  onClose?: () => void;
  /** Called with the newly created lead before closing (optional). */
  onCreated?: (lead: { id: string }) => void;
}) {
  const router = useRouter();
  const goBack = useMobileBack("/m/leads");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null);
  const { getDefault, recordDefaults } = useSmartDefaults("lead");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<typeof form>("lead", "lead-new");
  const [draftRestored, setDraftRestored] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    source: "PORTAL" as string,
    priority: "MEDIUM" as string,
    projectId: "",
    interestedUnitId: "",
    interestedUnitType: "",
    budgetMin: "",
    budgetMax: "",
    assignedToId: "",
    nextFollowUpAt: "",
    notes: "",
  });

  // ── Restore draft or apply smart defaults ──
  useEffect(() => {
    if (draftRestored || defaultsApplied) return;
    if (hasDraft) return; // wait for user to restore or discard via banner
    // Smart defaults: pre-fill project, source, and assignee from last-used
    const defProject = getDefault("projectId");
    const defSource = getDefault("source");
    const defAssignee = getDefault("assignedToId");
    setForm((f) => ({
      ...f,
      projectId: defProject && projects.some((p) => p.id === defProject) ? defProject : "",
      source: defSource ?? "PORTAL",
      assignedToId: defAssignee && assignees.some((a) => a.id === defAssignee)
        ? defAssignee
        : (currentUserId && assignees.some((a) => a.id === currentUserId) ? currentUserId : ""),
    }));
    setDefaultsApplied(true);
  }, [hasDraft, draft, draftRestored, defaultsApplied, getDefault, projects, assignees, currentUserId]);

  function restoreDraft() {
    if (draft) setForm(draft);
    setDraftRestored(true);
  }

  // ── Auto-save draft ──
  useEffect(() => {
    if (saving) return;
    const hasContent = form.name || form.phone || form.projectId || form.notes;
    if (!hasContent) return;
    saveDraft(form);
  }, [form, saving, saveDraft]);

  const filteredUnits = useMemo(
    () => form.projectId ? units.filter((u) => u.projectId === form.projectId) : units,
    [form.projectId, units],
  );

  function set(key: keyof typeof form, value: string) {
    setForm((c) => ({ ...c, [key]: value, ...(key === "projectId" ? { interestedUnitId: "" } : {}) }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.phone.trim()) return toast.error("Phone is required");
    setSaving(true);
    try {
      // Record smart defaults for next time
      recordDefaults({ projectId: form.projectId, source: form.source, assignedToId: form.assignedToId });

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email || undefined,
          source: form.source,
          priority: form.priority,
          projectId: form.projectId || undefined,
          interestedUnitId: form.interestedUnitId || undefined,
          interestedUnitType: form.interestedUnitType || undefined,
          budgetMin: form.budgetMin || undefined,
          budgetMax: form.budgetMax || undefined,
          assignedToId: form.assignedToId || undefined,
          nextFollowUpAt: form.nextFollowUpAt || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add lead");
      haptic([10, 40, 80]);
      clearDraft();
      setSuccess({ id: data.id, name: form.name.trim() });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="grid place-items-center size-14 rounded-full mb-3" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}>
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>Lead Added</p>
        <p className="text-m-caption font-mono mb-4" style={{ color: "var(--color-ink-700)" }}>{success.name}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => { if (onClose) { onCreated?.({ id: success.id }); onClose(); } else { router.push("/m/leads"); router.refresh(); } }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            <Eye className="size-4 inline mr-1" /> View Leads
          </button>
          <button onClick={() => { setSuccess(null); setForm({ name: "", phone: "", email: "", source: "PORTAL", priority: "MEDIUM", projectId: "", interestedUnitId: "", interestedUnitType: "", budgetMin: "", budgetMax: "", assignedToId: "", nextFollowUpAt: "", notes: "" }); router.refresh(); }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}>
            <Plus className="size-4 inline mr-1" /> Add Another Lead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => (onClose ? onClose() : goBack())}
          className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] text-m-body press"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Lead
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 text-m-section font-extrabold tracking-tight px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-ink-500)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <ContactRound className="size-2.5" />
          Pipeline
        </span>
      </div>

      {hasDraft && !draftRestored && (
        <DraftBanner
          formName="Lead"
          updatedAt={draftUpdatedAt}
          onRestore={restoreDraft}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* Contact */}
        <SectionCard title="Contact">
          <UnderlineInput
            label="Name"
            value={form.name}
            onChange={(v) => set("name", v)}
            placeholder="Lead name"
            required
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Phone"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              placeholder="9876543210"
              type="tel"
              inputMode="tel"
              required
            />
            <div className="pl-2">
              <UnderlineInput
                label="Email"
                value={form.email}
                onChange={(v) => set("email", v)}
                placeholder="lead@email.com"
                type="email"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <EnumSelect
              label="Source"
              value={form.source}
              onChange={(v) => set("source", v)}
              required
              options={SOURCES.map(([v, l]) => ({ value: v, label: l }))}
            />
            <div className="pl-2">
              <EnumSelect
                label="Priority"
                value={form.priority}
                onChange={(v) => set("priority", v)}
                options={PRIORITIES.map(([v, l]) => ({ value: v, label: l }))}
              />
            </div>
          </div>
        </SectionCard>

        {/* Project Interest */}
        <SectionCard title="Project Interest">
          <MobileProjectSelect
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Any project"
            icon={FolderOpen}
          />
          {form.projectId && <SmartDefaultsBadge />}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <MobileSelectWithCreate
              label="Interested unit"
              value={form.interestedUnitId}
              onChange={(v) => set("interestedUnitId", v)}
              options={filteredUnits.map((u) => ({ value: u.id, label: `${u.projectName} · ${u.label}` }))}
              placeholder="Not decided"
            />
            <div className="pl-2">
              <EnumSelect
                label="Unit type"
                value={form.interestedUnitType}
                onChange={(v) => set("interestedUnitType", v)}
                options={UNIT_TYPES.map(([v, l]) => ({ value: v, label: l }))}
              />
            </div>
          </div>
        </SectionCard>

        {/* Budget & Assignment */}
        <SectionCard title="Budget & Assignment">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Budget from (₹)"
              value={form.budgetMin}
              onChange={(v) => set("budgetMin", v)}
              placeholder="0"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
            />
            <div className="pl-2">
              <UnderlineInput
                label="Budget to (₹)"
                value={form.budgetMax}
                onChange={(v) => set("budgetMax", v)}
                placeholder="0"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
              />
            </div>
          </div>
          <MobileSelectWithCreate
            label="Owner (assigned to)"
            value={form.assignedToId}
            onChange={(v) => set("assignedToId", v)}
            options={assignees.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Unassigned"
          />
        </SectionCard>

        {/* Follow-up & Notes */}
        <SectionCard title="Follow-up & Notes">
          <UnderlineInput
            label="Next follow-up"
            value={form.nextFollowUpAt}
            onChange={(v) => set("nextFollowUpAt", v)}
            type="datetime-local"
          />
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any context about this lead…"
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={inputStyle}
            />
          </div>
        </SectionCard>

        {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
        <div
          className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
          style={{
            backgroundColor: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (onClose ? onClose() : goBack())}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim() || !form.phone.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
                opacity: saving || !form.name.trim() || !form.phone.trim() ? 0.5 : 1,
              }}
            >
              {saving ? "Adding…" : "Add Lead"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
