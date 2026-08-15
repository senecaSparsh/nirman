"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, CheckSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type Priority = "low" | "medium" | "high" | "urgent";

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "var(--color-ink-500)",
  medium: "var(--color-signal)",
  high: "var(--color-signal-dark)",
  urgent: "var(--color-stop)",
};

interface AssigneeOption {
  id: string;
  name: string;
  role: string;
}

interface FormState {
  title: string;
  description: string;
  assignedToId: string;
  priority: Priority;
  dueDate: string;
  estimateMins: string;
  subtasks: string[];
}

/**
 * MobileNewTaskDialog — bottom-sheet form for assigning a task to a
 * team member from the mobile surface. Mirrors the desktop
 * assign-task-dialog's API contract (POST /api/tasks).
 */
export function MobileNewTaskDialog({
  open,
  onClose,
  assignees,
}: {
  open: boolean;
  onClose: () => void;
  assignees: AssigneeOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    assignedToId: "",
    priority: "medium",
    dueDate: "",
    estimateMins: "",
    subtasks: [],
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addSubtask() {
    const v = newSubtask.trim();
    if (!v) return;
    set("subtasks", [...form.subtasks, v]);
    setNewSubtask("");
    haptic(10);
  }

  function removeSubtask(idx: number) {
    set("subtasks", form.subtasks.filter((_, i) => i !== idx));
    haptic(10);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    if (!form.assignedToId) {
      toast.error("Please select an assignee");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          assignedToId: form.assignedToId,
          priority: form.priority,
          dueDate: form.dueDate || null,
          estimateMins: form.estimateMins === "" ? null : Number(form.estimateMins),
          subtasks: form.subtasks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create task");
      haptic([10, 40, 80]);
      toast.success("Task assigned");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <CheckSquare className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              Assign Task
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Title */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Task Title <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Check concrete pour at Tower A"
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass} style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="What needs to be done?"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* Assignee */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Assign To <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={form.assignedToId}
              onChange={(e) => set("assignedToId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— Select team member —</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className={labelClass} style={labelStyle}>Priority</label>
            <div className="flex gap-1.5">
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { set("priority", p); haptic(10); }}
                  className="flex-1 h-8 rounded-[0.375rem] text-[0.5625rem] font-bold press"
                  style={{
                    color: form.priority === p ? "#fff" : PRIORITY_COLORS[p],
                    backgroundColor: form.priority === p ? PRIORITY_COLORS[p] : `color-mix(in srgb, ${PRIORITY_COLORS[p]} 8%, transparent)`,
                  }}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date + Estimate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Estimate (mins)</label>
              <input
                type="number"
                min={1}
                value={form.estimateMins}
                onChange={(e) => set("estimateMins", e.target.value)}
                placeholder="e.g. 30"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Subtasks / Checklist */}
          <div>
            <label className={labelClass} style={labelStyle}>Checklist (optional)</label>
            <div className="flex gap-1.5 mb-1.5">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Add a step…"
                enterKeyHint="done"
                className={inputClass}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={addSubtask}
                className="shrink-0 grid place-items-center size-10 rounded-[0.5rem] border press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
              >
                <Plus className="size-4" />
              </button>
            </div>
            {form.subtasks.length > 0 && (
              <div className="flex flex-col gap-1">
                {form.subtasks.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-[0.375rem] border px-2.5 py-1.5"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                  >
                    <span className="text-[0.6875rem] flex-1" style={{ color: "var(--color-ink-700)" }}>
                      {s}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(i)}
                      className="press"
                      style={{ color: "var(--color-ink-300)" }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-500)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Assigning…" : "Assign Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
