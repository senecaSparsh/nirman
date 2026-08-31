"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Workflow as WorkflowIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Clock,
  Zap,
  Bell,
  FileEdit,
  GitBranch,
  ShoppingCart,
  Package,
  Wrench,
  Truck,
  Building2,
  ClipboardList,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflow-templates";

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  ClipboardList,
  Package,
  Wallet,
  Building2,
  Wrench,
  Truck,
  Workflow: WorkflowIcon,
};

const SCHEDULE_OPTIONS: { label: string; value: number | null; description: string }[] = [
  { label: "Manual only", value: null, description: "Run only when you tap Run" },
  { label: "Every hour", value: 60, description: "Runs at the top of each hour" },
  { label: "Every 6 hours", value: 360, description: "4 times a day" },
  { label: "Every day", value: 1440, description: "Daily at the scheduled time" },
  { label: "Every week", value: 10080, description: "Weekly on the scheduled day" },
  { label: "Every month", value: 43200, description: "Monthly — approx 30 days" },
];

type Step = "template" | "details" | "schedule";

export function MobileNewWorkflowClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleInterval, setScheduleInterval] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  function selectTemplate(t: WorkflowTemplate) {
    setSelectedTemplate(t);
    setName(t.label);
    setDescription(t.description);
    setStep("details");
  }

  async function handleCreate() {
    if (!selectedTemplate) {
      toast.error("Select a template first");
      return;
    }
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setCreating(true);
    try {
      // 1. Create the workflow
      const createRes = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          icon: selectedTemplate.icon,
          graphJson: selectedTemplate.graph,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error ?? "Failed to create workflow");
      }

      // 2. If a schedule was selected, set it up
      if (scheduleInterval !== null) {
        const scheduleRes = await fetch(`/api/workflows/${createData.id}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intervalM: scheduleInterval,
            enabled: true,
          }),
        });
        if (!scheduleRes.ok) {
          const scheduleData = await scheduleRes.json().catch(() => ({}));
          toast.warning(`Workflow created, but scheduling failed: ${scheduleData.error ?? "unknown error"}`);
        }
      }

      toast.success("Workflow created");
      router.push(`/m/workflows/${createData.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (step === "details") setStep("template");
              else if (step === "schedule") setStep("details");
              else router.push("/m/workflows");
            }}
            className="text-m-body press p-1 -ml-1"
          >
            <ChevronLeft className="size-5" style={{ color: "var(--color-ink-500)" }} />
          </button>
          <div className="flex-1">
            <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              New Workflow
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              {step === "template" && "Step 1 of 3 · Choose a template"}
              {step === "details" && "Step 2 of 3 · Name & describe"}
              {step === "schedule" && "Step 3 of 3 · Set schedule"}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="flex gap-1 mt-2">
          {(["template", "details", "schedule"] as Step[]).map((s, i) => {
            const stepOrder = { template: 0, details: 1, schedule: 2 };
            const isDone = stepOrder[step] > i;
            const isActive = stepOrder[step] === i;
            return (
              <div
                key={s}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{
                  backgroundColor: isDone || isActive ? "var(--color-steel)" : "var(--color-line)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Template selection ── */}
      {step === "template" && (
        <div className="p-3 space-y-2">
          <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>
            Choose a Template
          </p>
          {WORKFLOW_TEMPLATES.map((t) => {
            const Icon = TEMPLATE_ICONS[t.icon] ?? WorkflowIcon;
            return (
              <button
                key={t.key}
                onClick={() => selectTemplate(t)}
                className="w-full text-left rounded-[0.625rem] border p-3 active:scale-[0.98] transition-transform press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="size-9 rounded-[0.5rem] text-m-body flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-steel) 10%, transparent)" }}
                  >
                    <Icon className="size-4" style={{ color: "var(--color-steel)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                      {t.label}
                    </p>
                    <p className="text-m-caption mt-0.5 leading-snug" style={{ color: "var(--color-ink-500)" }}>
                      {t.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {t.graph.steps.map((s, i) => (
                        <span
                          key={i}
                          className="text-m-caption font-semibold px-1.5 py-0.5 rounded-[0.25rem]"
                          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
                        >
                          {s.type.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 self-center" style={{ color: "var(--color-ink-300)" }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Step 2: Details ── */}
      {step === "details" && selectedTemplate && (
        <div className="p-3 space-y-4">
          {/* Selected template summary */}
          <div
            className="rounded-[0.625rem] border p-3"
            style={{ borderColor: "color-mix(in srgb, var(--color-steel) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-steel) 5%, transparent)" }}
          >
            <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>
              Selected Template
            </p>
            <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              {selectedTemplate.label}
            </p>
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {selectedTemplate.description}
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              Workflow Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly Site Inspection"
              className="w-full h-11 rounded-[0.5rem] border px-3 text-m-section outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this workflow does…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section outline-none resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Steps preview */}
          <div>
            <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>
              Steps ({selectedTemplate.graph.steps.length})
            </p>
            <div className="space-y-1.5">
              {selectedTemplate.graph.steps.map((s, i) => {
                const StepIcon = getStepIcon(s.type);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-[0.5rem] border p-2"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className="size-5 rounded-full flex items-center justify-center text-m-caption font-bold"
                        style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
                      >
                        {i + 1}
                      </span>
                      {i < selectedTemplate.graph.steps.length - 1 && (
                        <div className="w-px h-3" style={{ backgroundColor: "var(--color-line)" }} />
                      )}
                    </div>
                    <StepIcon className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />
                    <span className="text-m-body font-medium" style={{ color: "var(--color-ink-950)" }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setStep("schedule")}
            disabled={!name.trim()}
            className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 press"
            style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
          >
            Continue <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* ── Step 3: Schedule ── */}
      {step === "schedule" && (
        <div className="p-3 space-y-4">
          <div>
            <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>
              Schedule
            </p>
            <p className="text-m-caption mb-3" style={{ color: "var(--color-ink-500)" }}>
              How often should this workflow run automatically? You can always run it manually too.
            </p>
            <div className="space-y-2">
              {SCHEDULE_OPTIONS.map((opt) => {
                const isSelected = scheduleInterval === opt.value;
                return (
                  <button
                    key={opt.label}
                    onClick={() => setScheduleInterval(opt.value)}
                    className="w-full text-left rounded-[0.5rem] border p-3 flex items-center gap-2.5 transition-colors press"
                    style={{
                      borderColor: isSelected ? "var(--color-steel)" : "var(--color-line)",
                      backgroundColor: isSelected ? "color-mix(in srgb, var(--color-steel) 5%, transparent)" : "var(--color-paper)",
                    }}
                  >
                    <div className="flex-1">
                      <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                        {opt.label}
                      </p>
                      <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                        {opt.description}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="size-4 shrink-0" style={{ color: "var(--color-steel)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full h-12 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-2 press"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {creating ? "Creating…" : "Create Workflow"}
          </button>
        </div>
      )}
    </div>
  );
}

function getStepIcon(type: string): LucideIcon {
  const map: Record<string, LucideIcon> = {
    create_task: ClipboardList,
    send_notification: Bell,
    create_record: FileEdit,
    wait: Clock,
    condition: GitBranch,
    update_status: Zap,
    auto_requisition: ShoppingCart,
  };
  return map[type] ?? WorkflowIcon;
}
