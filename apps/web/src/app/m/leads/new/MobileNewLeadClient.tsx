"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ContactRound } from "lucide-react";
import { haptic } from "@/lib/haptic";

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
  onClose,
  onCreated,
}: {
  projects: ProjectItem[];
  units: UnitItem[];
  assignees: AssigneeItem[];
  /** When provided, the form closes this modal on success instead of navigating. */
  onClose?: () => void;
  /** Called with the newly created lead before closing (optional). */
  onCreated?: (lead: { id: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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
      toast.success("Lead added to the pipeline");
      if (onClose) {
        onCreated?.({ id: data.id });
        onClose();
      } else {
        router.push("/m/leads");
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => (onClose ? onClose() : router.back())}
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

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* Contact */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Contact
          </p>
          <div>
            <label className={labelClass} style={labelStyle}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Lead name"
              className={inputClass}
              style={inputStyle}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="9876543210"
                inputMode="tel"
                className={inputClass}
                style={inputStyle}
                required
              />
            </div>
            <div className="pl-2">
              <label className={labelClass} style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="lead@email.com"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>Source *</label>
              <select
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="pl-2">
              <label className={labelClass} style={labelStyle}>Priority</label>
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Project Interest */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Project Interest
          </p>
          <div>
            <label className={labelClass} style={labelStyle}>Project (optional)</label>
            <select
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">Any project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>Interested unit</label>
              <select
                value={form.interestedUnitId}
                onChange={(e) => set("interestedUnitId", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Not decided</option>
                {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.projectName} · {u.label}</option>)}
              </select>
            </div>
            <div className="pl-2">
              <label className={labelClass} style={labelStyle}>Unit type</label>
              <select
                value={form.interestedUnitType}
                onChange={(e) => set("interestedUnitType", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                {UNIT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Budget & Assignment */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Budget & Assignment
          </p>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>Budget from (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.budgetMin}
                onChange={(e) => set("budgetMin", e.target.value)}
                placeholder="0"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div className="pl-2">
              <label className={labelClass} style={labelStyle}>Budget to (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.budgetMax}
                onChange={(e) => set("budgetMax", e.target.value)}
                placeholder="0"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Owner (assigned to)</label>
            <select
              value={form.assignedToId}
              onChange={(e) => set("assignedToId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {/* Follow-up & Notes */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Follow-up & Notes
          </p>
          <div>
            <label className={labelClass} style={labelStyle}>Next follow-up</label>
            <input
              type="datetime-local"
              value={form.nextFollowUpAt}
              onChange={(e) => set("nextFollowUpAt", e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any context about this lead…"
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-1 pt-2">
          <button
            type="button"
            onClick={() => (onClose ? onClose() : router.back())}
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
      </form>
    </div>
  );
}
