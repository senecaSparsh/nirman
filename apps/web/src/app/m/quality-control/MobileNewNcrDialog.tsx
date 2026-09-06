"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useWbsOptions } from "@/lib/use-wbs-options";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

type NcrCategory = "MATERIAL" | "WORKMANSHIP" | "DESIGN" | "DOCUMENT" | "PROCESS" | "SAFETY" | "OTHER";
type NcrSeverity = "CRITICAL" | "MAJOR" | "MINOR" | "OBSERVATION";

const CATEGORIES: { value: NcrCategory; label: string }[] = [
  { value: "WORKMANSHIP", label: "Workmanship" },
  { value: "MATERIAL", label: "Material" },
  { value: "DESIGN", label: "Design" },
  { value: "DOCUMENT", label: "Document" },
  { value: "PROCESS", label: "Process" },
  { value: "SAFETY", label: "Safety" },
  { value: "OTHER", label: "Other" },
];

const SEVERITIES: { value: NcrSeverity; label: string; desc: string }[] = [
  { value: "CRITICAL", label: "Critical", desc: "Safety/structural — stop work" },
  { value: "MAJOR", label: "Major", desc: "Significant — rework required" },
  { value: "MINOR", label: "Minor", desc: "Small deviation — concession possible" },
  { value: "OBSERVATION", label: "Observation", desc: "Note for improvement" },
];

// Flatten a BOQ tree into a list of { id, label } for select options.
function flattenBoq(nodes: unknown[], depth = 0): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    const node = n as Record<string, unknown>;
    const prefix = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
    out.push({ id: String(node.id), label: `${prefix}${node.serialNo} — ${node.description}` });
    const children = node.children;
    if (Array.isArray(children) && children.length) out.push(...flattenBoq(children, depth + 1));
  }
  return out;
}

/**
 * MobileNewNcrForm — form content for raising a Non-Conformance Report.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * quality-control page, or wrapped by <MobileNewNcrDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewNcrForm({
  onClose,
  projects,
  subcontractors,
}: {
  onClose: () => void;
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
  const [boqOptions, setBoqOptions] = useState<{ id: string; label: string }[]>([]);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    description: "",
    category: "WORKMANSHIP" as NcrCategory,
    severity: "MINOR" as NcrSeverity,
    location: "",
    responsibleParty: "",
    subcontractorId: "",
    wbsNodeId: "",
    boqItemId: "",
  });

  const wbsOptions = useWbsOptions(form.projectId || null);

  // Fetch BOQ tree when the project changes.
  useEffect(() => {
    if (!form.projectId) { setBoqOptions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await globalThis.fetch(`/api/boq/tree?projectId=${form.projectId}`);
        const data = await res.json();
        if (!cancelled) setBoqOptions(flattenBoq(Array.isArray(data?.tree) ? data.tree : []));
      } catch {
        if (!cancelled) setBoqOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [form.projectId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    if (!form.projectId) { toast.error("Select a project"); return; }
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }

    setSaving(true);
    haptic(20);
    try {
      const res = await fetch("/api/quality-control/ncr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          severity: form.severity,
          location: form.location || null,
          responsibleParty: form.responsibleParty || null,
          subcontractorId: form.subcontractorId || null,
          wbsNodeId: form.wbsNodeId || null,
          boqItemId: form.boqItemId || null,
          attachments: attachments.map((a) => a.url),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("NCR raised");
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <div className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Details</p>
        <MobileSelectWithCreate
          label="Project"
          value={form.projectId}
          onChange={(v) => set("projectId", v)}
          placeholder="— Select project —"
          icon={FolderOpen}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <div>
          <label className={labelClass} style={labelStyle}>Title</label>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Uneven plaster in flat 302"
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <EnumSelect
              label="Category"
              value={form.category}
              onChange={(v) => set("category", v as NcrCategory)}
              options={CATEGORIES}
            />
          </div>
          <div className="pl-2">
            <EnumSelect
              label="Severity"
              value={form.severity}
              onChange={(v) => set("severity", v as NcrSeverity)}
              options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
        </div>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          {SEVERITIES.find((s) => s.value === form.severity)?.desc}
        </p>
      </div>

      {/* Description */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Description</p>
        <div>
          <label className={labelClass} style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="What is non-conforming? Be specific…"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Location & Linkage */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Location & Linkage</p>
        <div>
          <label className={labelClass} style={labelStyle}>Location (optional)</label>
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Tower A, 3rd floor, flat 302"
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <MobileSelectWithCreate
            label="WBS Activity"
            value={form.wbsNodeId}
            onChange={(v) => set("wbsNodeId", v)}
            placeholder={wbsOptions.length === 0 ? "No WBS nodes for this project" : "— None —"}
            disabled={wbsOptions.length === 0}
            options={wbsOptions.map((w) => ({ value: w.id, label: w.label }))}
          />
        </div>
        <div>
          <MobileSelectWithCreate
            label="BOQ Item"
            value={form.boqItemId}
            onChange={(v) => set("boqItemId", v)}
            placeholder={boqOptions.length === 0 ? "No BOQ items for this project" : "— None —"}
            disabled={boqOptions.length === 0}
            options={boqOptions.map((b) => ({ value: b.id, label: b.label }))}
          />
        </div>
      </div>

      {/* Responsibility */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Responsibility</p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>Responsible Party</label>
            <input
              value={form.responsibleParty}
              onChange={(e) => set("responsibleParty", e.target.value)}
              placeholder="e.g. In-house team"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div className="pl-2">
            <MobileSelectWithCreate
              label="Subcontractor"
              value={form.subcontractorId}
              onChange={(v) => set("subcontractorId", v)}
              placeholder="— None —"
              options={subcontractors.map((s) => ({
                value: s.id,
                label: s.name,
                sub: s.trade ?? undefined,
              }))}
            />
          </div>
        </div>
      </div>

      {/* Evidence */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Evidence</p>
        <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {saving ? "Raising…" : "Raise NCR"}
      </button>
    </div>
  );
}

/**
 * MobileNewNcrDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewNcrForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * leaves pages.
 */
export function MobileNewNcrDialog({
  open,
  onClose,
  projects,
  subcontractors,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New NCR">
      <MobileNewNcrForm onClose={onClose} projects={projects} subcontractors={subcontractors} />
    </MobileDialog>
  );
}
