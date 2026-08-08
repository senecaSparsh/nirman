"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus, Save, Play, Trash2, Clock, CheckCircle2,
  Workflow as WorkflowIcon, Calendar, Loader2,
  X, Zap, Bell, FileEdit, GitBranch, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/page";
import { cn, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type { WorkflowGraph, WorkflowStep, StepType } from "@/lib/workflow-engine";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";

// ── Step type definitions ──

const STEP_TYPES: Record<StepType, { label: string; icon: typeof Zap; color: string; description: string }> = {
  create_task: { label: "Create Task", icon: CheckCircle2, color: "#2563eb", description: "Assign a task to a user" },
  send_notification: { label: "Send Notification", icon: Bell, color: "#0ea5e9", description: "Notify a user in-app" },
  create_record: { label: "Create Record", icon: FileEdit, color: "#10b981", description: "Create a DB record (task, project cost, expense)" },
  wait: { label: "Wait", icon: Clock, color: "#f59e0b", description: "Pause for a duration" },
  condition: { label: "Condition", icon: GitBranch, color: "#8b5cf6", description: "Branch based on a condition (low stock, overdue POs, etc.)" },
  update_status: { label: "Update Status", icon: Zap, color: "#ec4899", description: "Update a record's status" },
  auto_requisition: { label: "Auto Requisition", icon: ShoppingCart, color: "#f97316", description: "Generate a draft requisition for low-stock materials" },
};

interface StepNodeData {
  step: WorkflowStep;
  isStart: boolean;
  [key: string]: unknown;
}

// ── Custom node component ──

function StepNode({ data, selected }: NodeProps) {
  const { step, isStart } = data as StepNodeData;
  const def = STEP_TYPES[step.type];
  const Icon = def.icon;

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        isStart && "border-primary",
      )}
      style={{ width: 200 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: `${def.color}18`, color: def.color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{step.label}</p>
          <p className="truncate text-caption text-muted-foreground">{def.label}</p>
        </div>
        {isStart && (
          <Badge variant="default" className="shrink-0 text-micro">START</Badge>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

// ── Main workflow builder ──

function WorkflowBuilderInner({
  workflowId,
  initialGraph,
  initialName,
  initialDescription,
  initialStatus,
  initialSchedule,
  runs,
}: {
  workflowId?: string;
  initialGraph?: WorkflowGraph;
  initialName?: string;
  initialDescription?: string;
  initialStatus?: string;
  initialSchedule?: { cron?: string | null; intervalM?: number | null; enabled?: boolean; nextRunAt?: string } | null;
  runs?: { id: string; status: string; currentStep: number | null; startedAt: string | null; completedAt: string | null; error: string | null; triggeredBy: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const { canManageWorkflows } = usePermissions();
  const canEdit = canManageWorkflows();

  const idCounter = useRef(0);
  const nextId = useCallback(() => `s${Date.now().toString(36)}${(idCounter.current++).toString(36)}`, []);

  // Initialize nodes/edges from graph
  const initialNodes: Node[] = initialGraph
    ? initialGraph.steps.map((step, i) => ({
        id: step.id,
        type: "step",
        position: { x: 200 + (i % 3) * 250, y: 80 + Math.floor(i / 3) * 180 },
        data: { step, isStart: step.id === initialGraph.startStepId } as StepNodeData,
      }))
    : [
        {
          id: "s1",
          type: "step",
          position: { x: 250, y: 80 },
          data: {
            step: { id: "s1", type: "create_task", label: "First step", config: { title: "New task", priority: "medium" } },
            isStart: true,
          } as StepNodeData,
        },
      ];

  const initialEdges: Edge[] = initialGraph
    ? initialGraph.edges.map((e) => ({
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        animated: true,
      }))
    : [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [name, setName] = useState(initialName ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [status, setStatus] = useState(initialStatus ?? "DRAFT");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCron, setScheduleCron] = useState(initialSchedule?.cron ?? "");
  const [scheduleInterval, setScheduleInterval] = useState(initialSchedule?.intervalM ? String(initialSchedule.intervalM) : "");
  const [scheduleEnabled, setScheduleEnabled] = useState(initialSchedule?.enabled ?? true);
  const [showStepPalette, setShowStepPalette] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: true }, eds)),
    [setEdges],
  );

  const addStep = (type: StepType) => {
    const id = nextId();
    const def = STEP_TYPES[type];
    const newStep: WorkflowStep = {
      id,
      type,
      label: def.label,
      config: getDefaultConfig(type),
    };
    const newNode: Node = {
      id,
      type: "step",
      position: { x: 200 + ((idCounter.current * 47) % 200), y: 80 + nodes.length * 80 },
      data: { step: newStep, isStart: false } as StepNodeData,
    };
    setNodes((nds) => [...nds, newNode]);
    setShowStepPalette(false);
    setSelectedStepId(id);
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== stepId) return n;
        const data = n.data as StepNodeData;
        return { ...n, data: { ...data, step: { ...data.step, ...updates } } };
      }),
    );
  };

  const deleteStep = (stepId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== stepId));
    setEdges((eds) => eds.filter((e) => e.source !== stepId && e.target !== stepId));
    if (selectedStepId === stepId) setSelectedStepId(null);
  };

  const setStartStep = (stepId: string) => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...(n.data as StepNodeData), isStart: n.id === stepId },
      })),
    );
  };

  const loadTemplate = (templateKey: string) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === templateKey);
    if (!tpl) return;
    const newNodes: Node[] = tpl.graph.steps.map((step, i) => ({
      id: step.id,
      type: "step",
      position: { x: 200 + (i % 3) * 250, y: 80 + Math.floor(i / 3) * 180 },
      data: { step, isStart: step.id === tpl.graph.startStepId } as StepNodeData,
    }));
    const newEdges: Edge[] = tpl.graph.edges.map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      animated: true,
      ...(e.condition ? { label: e.condition, data: { condition: e.condition } } : {}),
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    setName(tpl.label);
    setDescription(tpl.description);
    setShowTemplates(false);
    toast.success(`Loaded "${tpl.label}" template`);
  };

  const buildGraph = (): WorkflowGraph => {
    const steps = nodes.map((n) => (n.data as StepNodeData).step);
    const startNode = nodes.find((n) => (n.data as StepNodeData).isStart);
    const startStepId = startNode?.id ?? steps[0]?.id ?? "";
    return {
      steps,
      edges: edges.map((e) => ({
        from: e.source,
        to: e.target,
        ...(e.data?.condition ? { condition: String((e.data as Record<string, unknown>).condition) } : {}),
      })),
      startStepId,
    };
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Workflow name is required");
      return;
    }
    if (nodes.length === 0) {
      toast.error("Add at least one step");
      return;
    }

    setSaving(true);
    try {
      const graph = buildGraph();
      const body = { name: name.trim(), description: description.trim() || null, graphJson: graph, icon: "Workflow", status };
      const url = workflowId ? `/api/workflows/${workflowId}` : "/api/workflows";
      const method = workflowId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save workflow");
      } else {
        const data = await res.json();
        toast.success(workflowId ? "Workflow updated" : "Workflow created");
        if (!workflowId && data.id) {
          router.push(`/workflows/${data.id}`);
        } else {
          router.refresh();
        }
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    if (!workflowId) {
      toast.error("Save the workflow first");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/runs`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to run workflow");
      } else {
        toast.success(`Workflow run ${data.status.toLowerCase()}`);
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRunning(false);
    }
  };

  const saveSchedule = async () => {
    if (!workflowId) {
      toast.error("Save the workflow first");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { enabled: scheduleEnabled };
      if (scheduleCron.trim()) body.cron = scheduleCron.trim();
      if (scheduleInterval) body.intervalM = Number(scheduleInterval);

      const res = await fetch(`/api/workflows/${workflowId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save schedule");
      } else {
        toast.success("Schedule saved — workflow activated");
        setShowSchedule(false);
        setStatus("ACTIVE");
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const selectedNode = selectedStepId ? nodes.find((n) => n.id === selectedStepId) : null;
  const selectedStep = selectedNode ? (selectedNode.data as StepNodeData).step : null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name…"
            className="h-9 max-w-xs font-medium"
            disabled={!canEdit}
          />
          <StatusPill status={status} />
        </div>

        {canEdit && (
          <>
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowStepPalette(!showStepPalette)}>
                <Plus className="h-3.5 w-3.5" /> Add Step
              </Button>
              {showStepPalette && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStepPalette(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
                    {Object.entries(STEP_TYPES).map(([key, def]) => {
                      const Icon = def.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => addStep(key as StepType)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: def.color }} />
                          <div>
                            <p className="text-body font-medium">{def.label}</p>
                            <p className="text-caption text-muted-foreground">{def.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <Button variant="ghost" size="sm" onClick={() => setShowTemplates(true)}>
              <WorkflowIcon className="h-3.5 w-3.5" /> Templates
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setShowSchedule(true)}>
              <Calendar className="h-3.5 w-3.5" /> Schedule
            </Button>

            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {workflowId ? "Save" : "Create"}
            </Button>
          </>
        )}

        {workflowId && canEdit && (
          <Button variant="default" size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run Now
          </Button>
        )}
      </div>

      {description !== undefined && canEdit && (
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)…"
          className="h-8 text-body"
        />
      )}

      {/* Canvas + sidebar */}
      <div className="flex gap-3">
        {/* Canvas */}
        <div className="relative h-[calc(100vh-16rem)] flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedStepId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => STEP_TYPES[(n.data as StepNodeData)?.step?.type ?? "create_task"].color}
              className="!bg-card"
            />
          </ReactFlow>

          {!canEdit && (
            <div className="absolute right-3 top-3 rounded-md bg-muted/80 px-2 py-1 text-caption text-muted-foreground backdrop-blur">
              Read-only — your role cannot edit workflows
            </div>
          )}
        </div>

        {/* Step editor sidebar */}
        {selectedStep && canEdit && (
          <StepEditor
            step={selectedStep}
            onUpdate={(updates) => updateStep(selectedStepId!, updates)}
            onDelete={() => deleteStep(selectedStepId!)}
            onSetStart={() => setStartStep(selectedStepId!)}
            isStart={(selectedNode!.data as StepNodeData).isStart}
            onClose={() => setSelectedStepId(null)}
          />
        )}
      </div>

      {/* Run history */}
      {workflowId && runs && runs.length > 0 && (
        <div className="space-y-2">
          <p className="text-body font-medium">Recent Runs</p>
          <div className="space-y-1.5">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <StatusPill status={r.status} />
                <span className="text-caption text-muted-foreground">{r.createdAt}</span>
                {r.currentStep != null && <span className="text-caption text-muted-foreground">Step: {r.currentStep + 1}</span>}
                {r.triggeredBy && <span className="text-caption text-muted-foreground">by {r.triggeredBy}</span>}
                {r.error && <span className="flex-1 truncate text-caption text-destructive">{r.error}</span>}
                {r.completedAt && <span className="text-caption text-muted-foreground">completed {r.completedAt}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates} title="Workflow Templates" description="Start from a pre-built automation chain">
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKFLOW_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => loadTemplate(tpl.key)}
              className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
            >
              <p className="text-body font-medium">{tpl.label}</p>
              <p className="mt-1 text-caption text-muted-foreground">{tpl.description}</p>
              <p className="mt-2 text-micro text-muted-foreground">{tpl.graph.steps.length} steps</p>
            </button>
          ))}
        </div>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule} title="Schedule Workflow" description="Set up recurring execution">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Interval (minutes)</Label>
            <Input
              type="number"
              value={scheduleInterval}
              onChange={(e) => setScheduleInterval(e.target.value)}
              placeholder="e.g. 60 for hourly, 1440 for daily"
            />
            <p className="text-caption text-muted-foreground">How often to run this workflow</p>
          </div>

          <div className="space-y-1.5">
            <Label>Cron Expression (advanced)</Label>
            <Input
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              placeholder="e.g. 0 9 * * 1 (every Monday 9am)"
            />
            <p className="text-caption text-muted-foreground">
              Standard cron format: minute hour day month weekday
            </p>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-body">Enabled</span>
          </label>

          {initialSchedule?.nextRunAt && (
            <p className="text-caption text-muted-foreground">
              Next scheduled run: {formatDate(initialSchedule.nextRunAt)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancel</Button>
            <Button onClick={saveSchedule} disabled={saving || (!scheduleCron && !scheduleInterval)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Schedule
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ── Step editor sidebar ──

function StepEditor({
  step,
  onUpdate,
  onDelete,
  onSetStart,
  isStart,
  onClose,
}: {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep>) => void;
  onDelete: () => void;
  onSetStart: () => void;
  isStart: boolean;
  onClose: () => void;
}) {
  const def = STEP_TYPES[step.type];
  const Icon = def.icon;

  return (
    <div className="w-80 shrink-0 space-y-3 rounded-lg border border-border bg-card p-4 max-h-[calc(100vh-16rem)] overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: `${def.color}18`, color: def.color }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-body font-medium">{def.label}</span>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label>Step Label</Label>
        <Input
          value={step.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="e.g. Send reminder to supervisor"
        />
      </div>

      {!isStart && (
        <Button variant="outline" size="sm" onClick={onSetStart} className="w-full">
          Set as Start Step
        </Button>
      )}
      {isStart && (
        <Badge variant="default" className="w-full justify-center py-1">START STEP</Badge>
      )}

      {/* Step-type-specific config */}
      {step.type === "create_task" && <CreateTaskConfig step={step} onUpdate={onUpdate} />}
      {step.type === "send_notification" && <NotificationConfig step={step} onUpdate={onUpdate} />}
      {step.type === "wait" && <WaitConfig step={step} onUpdate={onUpdate} />}
      {step.type === "update_status" && <UpdateStatusConfig step={step} onUpdate={onUpdate} />}
      {step.type === "condition" && <ConditionConfig step={step} onUpdate={onUpdate} />}
      {step.type === "auto_requisition" && <AutoRequisitionConfig step={step} onUpdate={onUpdate} />}
      {step.type === "create_record" && <CreateRecordConfig step={step} onUpdate={onUpdate} />}

      <div className="pt-2 border-t border-border">
        <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
          <Trash2 className="h-3.5 w-3.5" /> Delete Step
        </Button>
      </div>
    </div>
  );
}

// ── Step config components ──

function CreateTaskConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUsers(d); }).catch(() => toast.error("Failed to load users"));
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Task Config</p>
      <div className="space-y-1.5">
        <Label>Task Title</Label>
        <Input
          value={String(step.config.title ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, title: e.target.value } })}
          placeholder="Task title"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Assign To</Label>
        <Select
          value={String(step.config.assignedToId ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, assignedToId: e.target.value } })}
        >
          <option value="">Select user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select
          value={String(step.config.priority ?? "medium")}
          onChange={(e) => onUpdate({ config: { ...step.config, priority: e.target.value } })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Instructions</Label>
        <Textarea
          value={String(step.config.instructions ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, instructions: e.target.value } })}
          placeholder="Step-by-step guidance for the assignee"
          rows={4}
        />
      </div>
    </div>
  );
}

function NotificationConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUsers(d); }).catch(() => toast.error("Failed to load users"));
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Notification Config</p>
      <div className="space-y-1.5">
        <Label>Recipient</Label>
        <Select
          value={String(step.config.assignedToId ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, assignedToId: e.target.value } })}
        >
          <option value="">Select user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notification Title</Label>
        <Input
          value={String(step.config.title ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, title: e.target.value } })}
          placeholder="Notification title"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea
          value={String(step.config.message ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, message: e.target.value } })}
          placeholder="Notification message"
          rows={3}
        />
      </div>
    </div>
  );
}

function WaitConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Wait Config</p>
      <div className="space-y-1.5">
        <Label>Wait Duration (minutes)</Label>
        <Input
          type="number"
          value={String(step.config.minutes ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, minutes: Number(e.target.value) } })}
          placeholder="e.g. 60 for 1 hour"
        />
      </div>
    </div>
  );
}

function UpdateStatusConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Update Status Config</p>
      <div className="space-y-1.5">
        <Label>Entity Type</Label>
        <Select
          value={String(step.config.entityType ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, entityType: e.target.value } })}
        >
          <option value="">Select type…</option>
          <option value="Project">Project</option>
          <option value="PurchaseOrder">Purchase Order</option>
          <option value="MaterialRequisition">Requisition</option>
          <option value="StockTransfer">Stock Transfer</option>
          <option value="Task">Task</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Entity ID</Label>
        <Input
          value={String(step.config.entityId ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, entityId: e.target.value } })}
          placeholder="Record ID"
        />
      </div>
      <div className="space-y-1.5">
        <Label>New Status</Label>
        <Input
          value={String(step.config.newStatus ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, newStatus: e.target.value } })}
          placeholder="e.g. COMPLETED"
        />
      </div>
    </div>
  );
}

function ConditionConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Condition Config</p>
      <div className="space-y-1.5">
        <Label>Predicate (what to check)</Label>
        <Select
          value={String(step.config.predicate ?? "low_stock")}
          onChange={(e) => onUpdate({ config: { ...step.config, predicate: e.target.value } })}
        >
          <option value="low_stock">Low stock — any material below reorder point</option>
          <option value="overdue_pos">Overdue POs — any PO past expected date</option>
          <option value="pending_approvals">Pending approvals — any DRAFT POs or SUBMITTED requisitions</option>
          <option value="task_count">Open task count above threshold</option>
          <option value="custom_field">Custom field — evaluate a field on a record</option>
        </Select>
      </div>
      <div className="rounded-md bg-muted/40 p-2 text-caption text-muted-foreground">
        Connect the <strong>true</strong> edge to the step that runs when the condition is met,
        and the <strong>false</strong> edge to the step that runs when it isn&apos;t.
      </div>
      {String(step.config.predicate) === "task_count" && (
        <div className="space-y-1.5">
          <Label>Threshold (open tasks)</Label>
          <Input
            type="number"
            value={String(step.config.threshold ?? "0")}
            onChange={(e) => onUpdate({ config: { ...step.config, threshold: Number(e.target.value) } })}
            placeholder="e.g. 5"
          />
        </div>
      )}
    </div>
  );
}

function AutoRequisitionConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setProjects(d.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Auto Requisition Config</p>
      <div className="space-y-1.5">
        <Label>Project</Label>
        <Select
          value={String(step.config.projectId ?? "")}
          onChange={(e) => onUpdate({ config: { ...step.config, projectId: e.target.value } })}
        >
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div className="rounded-md bg-muted/40 p-2 text-caption text-muted-foreground">
        Generates a DRAFT requisition for all materials below their reorder point.
        The requisition still needs human review and submission before it becomes a PO.
      </div>
    </div>
  );
}

function CreateRecordConfig({ step, onUpdate }: { step: WorkflowStep; onUpdate: (u: Partial<WorkflowStep>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Create Record Config</p>
      <div className="space-y-1.5">
        <Label>Record Type</Label>
        <Select
          value={String(step.config.recordType ?? "task")}
          onChange={(e) => onUpdate({ config: { ...step.config, recordType: e.target.value } })}
        >
          <option value="task">Task</option>
          <option value="project_cost">Project Cost</option>
          <option value="expense">Company Expense</option>
        </Select>
      </div>
      {String(step.config.recordType) !== "task" && (
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={String(step.config.description ?? "")}
            onChange={(e) => onUpdate({ config: { ...step.config, description: e.target.value } })}
            placeholder="e.g. Monthly overhead allocation"
          />
        </div>
      )}
      {String(step.config.recordType) !== "task" && (
        <div className="space-y-1.5">
          <Label>Amount (₹)</Label>
          <Input
            type="number"
            value={String(step.config.amount ?? "")}
            onChange={(e) => onUpdate({ config: { ...step.config, amount: Number(e.target.value) } })}
            placeholder="0.00"
          />
        </div>
      )}
    </div>
  );
}

function getDefaultConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case "create_task":
      return { title: "New task", priority: "medium" };
    case "send_notification":
      return { title: "Notification", message: "" };
    case "wait":
      return { minutes: 60 };
    case "condition":
      return { predicate: "low_stock" };
    case "update_status":
      return {};
    case "create_record":
      return { recordType: "task" };
    case "auto_requisition":
      return {};
    default:
      return {};
  }
}

// ── Exported wrapper with ReactFlowProvider ──

export function WorkflowBuilder(props: {
  workflowId?: string;
  initialGraph?: WorkflowGraph;
  initialName?: string;
  initialDescription?: string;
  initialStatus?: string;
  initialSchedule?: { cron?: string | null; intervalM?: number | null; enabled?: boolean; nextRunAt?: string } | null;
  runs?: { id: string; status: string; currentStep: number | null; startedAt: string | null; completedAt: string | null; error: string | null; triggeredBy: string | null; createdAt: string }[];
}) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
