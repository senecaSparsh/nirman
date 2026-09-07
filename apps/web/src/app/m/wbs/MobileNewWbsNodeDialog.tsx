"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

type WbsNodeType = "PROJECT_NODE" | "PHASE_NODE" | "ACTIVITY" | "SUB_ACTIVITY" | "MILESTONE";

const TYPE_LABELS: Record<WbsNodeType, string> = {
  PROJECT_NODE: "Project",
  PHASE_NODE: "Phase",
  ACTIVITY: "Activity",
  SUB_ACTIVITY: "Sub-Activity",
  MILESTONE: "Milestone",
};

// Allowed child types per parent type (matches desktop wbs-view)
const CHILD_TYPES: Record<WbsNodeType | "ROOT", WbsNodeType[]> = {
  ROOT: ["PROJECT_NODE", "PHASE_NODE"],
  PROJECT_NODE: ["PHASE_NODE"],
  PHASE_NODE: ["ACTIVITY", "MILESTONE"],
  ACTIVITY: ["SUB_ACTIVITY", "MILESTONE"],
  SUB_ACTIVITY: ["MILESTONE"],
  MILESTONE: [],
};

interface ParentOption {
  id: string;
  code: string;
  name: string;
  type: WbsNodeType;
}

interface BoqItemOption {
  id: string;
  serialNo: string;
  description: string;
}

interface FormState {
  type: WbsNodeType;
  parentId: string;
  code: string;
  name: string;
  description: string;
  plannedStart: string;
  plannedEnd: string;
  isCritical: boolean;
  boqItemId: string;
}

/**
 * MobileNewWbsNodeDialog — bottom-sheet form for adding a WBS node
 * from the mobile surface. Submits POST /api/wbs/nodes.
 */
export function MobileNewWbsNodeDialog({
  open,
  onClose,
  projectId,
  parentNodes,
  boqItems,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  parentNodes: ParentOption[];
  boqItems: BoqItemOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    type: "ACTIVITY",
    parentId: "",
    code: "",
    name: "",
    description: "",
    plannedStart: "",
    plannedEnd: "",
    isCritical: false,
    boqItemId: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // When parent changes, reset type to first allowed child type
  function onParentChange(parentId: string) {
    const parent = parentNodes.find((p) => p.id === parentId);
    const allowed = parent ? CHILD_TYPES[parent.type] ?? [] : CHILD_TYPES.ROOT;
    const firstAllowed = allowed[0] ?? "ACTIVITY";
    setForm((f) => ({ ...f, parentId, type: firstAllowed }));
  }

  const selectedParent = parentNodes.find((p) => p.id === form.parentId);
  const allowedTypes = selectedParent
    ? CHILD_TYPES[selectedParent.type] ?? []
    : CHILD_TYPES.ROOT;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) {
      toast.error("Code is required (e.g. 1, 1.1, A-1)");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      toast.error("Planned end must be after planned start");
      return;
    }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/wbs/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          parentId: form.parentId || undefined,
          type: form.type,
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          plannedStart: form.plannedStart
            ? new Date(form.plannedStart).toISOString()
            : undefined,
          plannedEnd: form.plannedEnd
            ? new Date(form.plannedEnd).toISOString()
            : undefined,
          isCritical: form.isCritical || undefined,
          boqItemId: form.boqItemId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create WBS node");
      haptic([10, 40, 80]);
      toast.success("WBS node added");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const isMilestone = form.type === "MILESTONE";

  return (
    <MobileDialog open={open} onClose={onClose} title="New WBS Node">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Hierarchy */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Hierarchy
            </p>
            {/* Parent (optional) */}
            {parentNodes.length > 0 && (
              <div>
                <MobileSelectWithCreate
                  label="Parent"
                  value={form.parentId}
                  onChange={onParentChange}
                  placeholder="— Top-level (no parent) —"
                  options={parentNodes.map((p) => ({
                    value: p.id,
                    label: `${p.code} · ${p.name}`,
                    sub: TYPE_LABELS[p.type],
                  }))}
                  inputClass={inputClass}
                  inputStyle={inputStyle}
                />
              </div>
            )}

            {/* Type selector */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Node Type
              </label>
              <div className="flex gap-2 flex-wrap">
                {allowedTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      set("type", t);
                      haptic(10);
                    }}
                    className="flex-1 min-w-[5rem] h-10 rounded-[0.5rem] border-2 text-m-caption font-bold text-m-body press"
                    style={{
                      borderColor:
                        form.type === t
                          ? "var(--color-ink-950)"
                          : "var(--color-line)",
                      backgroundColor:
                        form.type === t
                          ? "var(--color-ink-950)"
                          : "var(--color-paper)",
                      color:
                        form.type === t
                          ? "var(--color-paper)"
                          : "var(--color-ink-500)",
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Node Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Node Details
            </p>
            {/* Code + Name */}
            <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Code <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder="1.1"
                  autoFocus
                  enterKeyHint="next"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="col-span-2 pl-2">
                <label className={labelClass} style={labelStyle}>
                  Name <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Foundation Works"
                  enterKeyHint="next"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Description (optional)
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={1}
                placeholder="Additional context…"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Schedule & Links */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Schedule &amp; Links
            </p>
            {/* Dates */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Planned Start
                </label>
                <input
                  type="date"
                  value={form.plannedStart}
                  onChange={(e) => set("plannedStart", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>
                  Planned End{isMilestone ? " (= start)" : ""}
                </label>
                <input
                  type="date"
                  value={isMilestone ? form.plannedStart : form.plannedEnd}
                  onChange={(e) => set("plannedEnd", e.target.value)}
                  disabled={isMilestone}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* BOQ link (for ACTIVITY / SUB_ACTIVITY) */}
            {(form.type === "ACTIVITY" || form.type === "SUB_ACTIVITY") &&
              boqItems.length > 0 && (
                <div>
                  <MobileSelectWithCreate
                    label="BOQ Item"
                    value={form.boqItemId}
                    onChange={(v) => set("boqItemId", v)}
                    placeholder="— None —"
                    options={boqItems.map((b) => ({
                      value: b.id,
                      label: b.serialNo,
                      sub: b.description,
                    }))}
                    inputClass={inputClass}
                    inputStyle={inputStyle}
                  />
                </div>
              )}

            {/* Critical path toggle */}
            <label
              className="flex items-center gap-2 cursor-pointer touch"
              onClick={() => {
                set("isCritical", !form.isCritical);
                haptic(10);
              }}
            >
              <span
                className="grid place-items-center size-5 rounded-[0.375rem] border-2"
                style={{
                  borderColor: form.isCritical
                    ? "var(--color-stop)"
                    : "var(--color-line)",
                  backgroundColor: form.isCritical
                    ? "var(--color-stop)"
                    : "transparent",
                }}
              >
                {form.isCritical ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    className="size-3"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : null}
              </span>
              <span
                className="text-m-body font-semibold"
                style={{ color: "var(--color-ink-700)" }}
              >
                Critical path node
              </span>
            </label>
          </div>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-3 -mb-3 px-3 py-2"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Adding…" : "Add Node"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}

/**
 * MobileWbsFab — floating action button + dialog launcher for adding WBS nodes.
 */
export function MobileWbsFab({
  projectId,
  parentNodes,
  boqItems,
}: {
  projectId: string;
  parentNodes: ParentOption[];
  boqItems: BoqItemOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
        style={{
          bottom:
            "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
        aria-label="Add WBS node"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileNewWbsNodeDialog
          open={open}
          onClose={() => setOpen(false)}
          projectId={projectId}
          parentNodes={parentNodes}
          boqItems={boqItems}
        />
      )}
    </>
  );
}
