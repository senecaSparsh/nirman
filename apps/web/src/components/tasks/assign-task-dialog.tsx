"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Plus, X, ListChecks } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled title */
  defaultTitle?: string;
  /** Called when a task is successfully created */
  onCreated?: () => void;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export function AssignTaskDialog({
  open,
  onOpenChange,
  defaultTitle,
  onCreated,
}: AssignTaskDialogProps) {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [estimateMins, setEstimateMins] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? "");
      setDescription("");
      setInstructions("");
      setAssignedToId("");
      setPriority("medium");
      setDueDate("");
      setEstimateMins("");
      setSteps([]);
      setNewStep("");
    }
  }, [open, defaultTitle]);

  // Fetch active users when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUsers(data.filter((u: UserOption) => u.active));
        }
      })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedToId) {
      toast.error("Please select someone to assign this task to");
      return;
    }
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          assignedToId,
          priority,
          dueDate: dueDate || null,
          estimateMins: estimateMins ? Number(estimateMins) : null,
          subtasks: steps.filter((s) => s.trim().length > 0),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to assign task");
      } else {
        toast.success("Task assigned — the assignee will see it on their dashboard");
        onOpenChange(false);
        onCreated?.();
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign Task"
      description="Create a task for a signed-in user. They'll see it on their dashboard with your guidance."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Task Title *</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Verify cement delivery for Phase 1"
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-assignee">Assign To *</Label>
          <Select
            id="task-assignee"
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            required
            disabled={loadingUsers}
          >
            <option value="">
              {loadingUsers ? "Loading users…" : "Select a user…"}
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role}) — {u.email}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due">Due Date</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-desc">Description (optional)</Label>
          <Input
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief context about the task"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-instructions">Step-by-step Guidance (optional)</Label>
          <Textarea
            id="task-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={"What the assignee needs to do:\n1. Check the delivery note against the PO\n2. Verify cement bags count\n3. Sign the goods receipt\n4. Report any discrepancies"}
            rows={5}
          />
          <p className="text-caption text-muted-foreground">
            This guidance will be shown to the assignee on their dashboard.
          </p>
        </div>

        {/* Checklist steps — become checkable SubTasks in the detail drawer */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Checklist Steps (optional)</Label>
          <p className="text-caption text-muted-foreground">Break the task into checkable steps. Progress is tracked automatically.</p>
          {steps.length > 0 && (
            <div className="space-y-1">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="text-caption font-semibold text-muted-foreground tnum">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-body">{step}</span>
                  <button
                    type="button"
                    onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                    className="rounded p-0.5 text-muted-foreground hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = newStep.trim();
                  if (v) { setSteps([...steps, v]); setNewStep(""); }
                }
              }}
              placeholder="Add a step and press Enter…"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const v = newStep.trim();
                if (v) { setSteps([...steps, v]); setNewStep(""); }
              }}
              disabled={!newStep.trim()}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-estimate">Time Estimate (minutes, optional)</Label>
          <Input
            id="task-estimate"
            type="number"
            min={1}
            value={estimateMins}
            onChange={(e) => setEstimateMins(e.target.value)}
            placeholder="e.g. 120"
          />
          <p className="text-caption text-muted-foreground">Planned effort. Compared against logged time in the Time tab.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !assignedToId || !title.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Assign Task
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
