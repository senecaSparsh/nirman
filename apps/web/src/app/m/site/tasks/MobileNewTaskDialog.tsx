"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

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
  instructions: string;
  assignedToId: string;
  priority: Priority;
  dueDate: string;
  estimateMins: string;
  subtasks: string[];
}

/**
 * MobileNewTaskForm — form content for assigning a task.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * tasks page, or wrapped by <MobileNewTaskDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewTaskForm({
  onClose,
  assignees,
}: {
  onClose: () => void;
  assignees: AssigneeOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    instructions: "",
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
    set(
      "subtasks",
      form.subtasks.filter((_, i) => i !== idx),
    );
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
          instructions: form.instructions.trim() || null,
          assignedToId: form.assignedToId,
          priority: form.priority,
          dueDate: form.dueDate || null,
          estimateMins:
            form.estimateMins === "" ? null : Number(form.estimateMins),
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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <SectionCard title="Details">
        <UnderlineInput
          label="Task Title"
          value={form.title}
          onChange={(v) => set("title", v)}
          placeholder="e.g. Check concrete pour at Tower A"
          required
          autoFocus
          enterKeyHint="next"
        />
        <div>
          <label className={labelClass} style={labelStyle}>
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            placeholder="What needs to be done?"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>
            Step-by-step Guidance (optional)
          </label>
          <textarea
            value={form.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            rows={3}
            placeholder="Numbered steps the assignee should follow…"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <MobileSelectWithCreate
              label="Assign To"
              required
              value={form.assignedToId}
              onChange={(v) => set("assignedToId", v)}
              options={assignees.map((a) => ({ value: a.id, label: `${a.name} (${a.role})` }))}
              placeholder="— Select team member —"
            />
          </div>
          {/* Priority — custom colored button group, stays inline */}
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>
              Priority
            </label>
            <div className="flex gap-1.5">
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    set("priority", p);
                    haptic(10);
                  }}
                  className="flex-1 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                  style={{
                    color: form.priority === p ? "var(--color-paper)" : PRIORITY_COLORS[p],
                    backgroundColor:
                      form.priority === p
                        ? PRIORITY_COLORS[p]
                        : `color-mix(in srgb, ${PRIORITY_COLORS[p]} 8%, transparent)`,
                  }}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Schedule */}
      <SectionCard title="Schedule">
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Due Date"
            value={form.dueDate}
            onChange={(v) => set("dueDate", v)}
            type="date"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Estimate (mins)"
              value={form.estimateMins}
              onChange={(v) => set("estimateMins", v)}
              placeholder="e.g. 30"
              type="number"
              min="1"
              inputMode="numeric"
            />
          </div>
        </div>
      </SectionCard>

      {/* Checklist */}
      <SectionCard title="Checklist">
        {/* Subtask input has onKeyDown Enter — stays inline */}
        <div className="flex gap-1.5">
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
            aria-label="Add task"
            className="shrink-0 grid place-items-center size-8 rounded-[0.375rem] border press"
            style={{
              borderColor: "var(--color-line)",
              color: "var(--color-ink-700)",
              backgroundColor: "transparent",
            }}
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
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper-2)",
                }}
              >
                <span
                  className="text-m-body flex-1"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  {s}
                </span>
                <button
                  type="button"
                  onClick={() => removeSubtask(i)}
                  aria-label="Remove task"
                  className="text-m-body press"
                  style={{ color: "var(--color-ink-300)" }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving ? "Assigning…" : "Assign Task"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewTaskDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewTaskForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * employees pages.
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
  return (
    <MobileDialog open={open} onClose={onClose} title="New Task">
      <MobileNewTaskForm onClose={onClose} assignees={assignees} />
    </MobileDialog>
  );
}
