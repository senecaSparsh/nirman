"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Plus, Loader2, CheckCircle2, XCircle, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/page";

type Template = {
  id: string;
  eventType: string;
  channel: string;
  template: string;
  isActive: boolean;
};

type Stats = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
};

const EVENT_TYPES = [
  { value: "LOW_STOCK", label: "Low Stock" },
  { value: "TASK_ASSIGNMENT", label: "Task Assignment" },
  { value: "QUOTE_APPROVAL", label: "Quote Approval" },
  { value: "DPR_APPROVAL", label: "DPR Approval" },
  { value: "PAYMENT_RECEIVED", label: "Payment Received" },
  { value: "SCRAP_GENERATED", label: "Scrap Generated" },
];

const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "IN_APP", label: "In-App" },
];

export function NotificationsPanel() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, sent: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<Array<{
    id: string;
    eventType: string;
    channel: string;
    recipient: string;
    recipientName: string | null;
    message: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setTemplates(data.templates ?? []);
      setStats(data.stats ?? { total: 0, sent: 0, failed: 0, pending: 0 });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadLog() {
    try {
      const res = await fetch("/api/notifications/log?limit=50");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load log");
      setLogs(data.rows ?? []);
      setShowLog(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-meta text-muted-foreground">Loading notifications…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-body font-semibold">Notifications</h3>
            <p className="text-caption text-muted-foreground">WhatsApp / email / in-app alert templates and delivery log</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadLog}>View Log</Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Template
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="tnum text-body font-medium">{stats.sent}</span>
          <span className="text-caption text-muted-foreground">sent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-warning" />
          <span className="tnum text-body font-medium">{stats.pending}</span>
          <span className="text-caption text-muted-foreground">pending</span>
        </div>
        {stats.failed > 0 && (
          <div className="flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-danger" />
            <span className="tnum text-body font-medium">{stats.failed}</span>
            <span className="text-caption text-muted-foreground">failed</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-caption text-muted-foreground">Total:</span>
          <span className="tnum text-body">{stats.total}</span>
        </div>
      </div>

      {/* Templates list */}
      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-body text-muted-foreground">No notification templates yet</p>
          <p className="text-caption text-muted-foreground">Create templates for low stock, task assignments, quote approvals, and more.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={t.channel === "WHATSAPP" ? "success" : t.channel === "EMAIL" ? "brand" : "muted"} className="text-micro">
                    {t.channel}
                  </Badge>
                  <span className="text-body font-medium">{EVENT_TYPES.find((e) => e.value === t.eventType)?.label ?? t.eventType}</span>
                  {!t.isActive && <StatusPill status="INACTIVE" />}
                </div>
              </div>
              <p className="mt-1.5 text-caption text-muted-foreground font-mono">{t.template}</p>
            </div>
          ))}
        </div>
      )}

      {/* Log dialog */}
      {showLog && (
        <Dialog
          open
          onOpenChange={(o) => !o && setShowLog(false)}
          title="Notification Log"
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
        >
          {logs.length === 0 ? (
            <p className="py-8 text-center text-meta text-muted-foreground">No notifications sent yet.</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2">
                  <StatusPill status={l.status} className="text-micro shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-caption font-medium">{l.eventType}</span>
                      <Badge variant="outline" className="text-micro">{l.channel}</Badge>
                      <span className="text-micro text-muted-foreground">→ {l.recipient}</span>
                    </div>
                    <p className="mt-0.5 text-micro text-muted-foreground truncate">{l.message}</p>
                    {l.errorMessage && <p className="mt-0.5 text-micro text-danger">{l.errorMessage}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Dialog>
      )}

      {/* Template form */}
      {formOpen && (
        <TemplateForm
          onOpenChange={setFormOpen}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function TemplateForm({ onOpenChange, onSaved }: { onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [eventType, setEventType] = useState("LOW_STOCK");
  const [channel, setChannel] = useState("WHATSAPP");
  const [template, setTemplate] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!template.trim()) return toast.error("Template is required");
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, channel, template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Template saved");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="New Notification Template"
      description="Define a message template with {{variables}} for a specific event type and channel"
      className="max-w-lg"
    >
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Event Type *</Label>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {EVENT_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Channel *</Label>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Template *</Label>
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={4}
            placeholder="⚠️ Low Stock Alert: {{materialName}} ({{materialCode}}) — current stock: {{totalQty}} {{unit}}. Please raise a requisition."
          />
          <p className="text-micro text-muted-foreground">Use {"{{variables}}"} for dynamic content. The system replaces them at send time.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Template"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
