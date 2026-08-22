"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, MessageSquarePlus, Phone, UserRoundCheck } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Figure, StatusPill } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LeadDetail, LeadRow, LeadStage } from "@/lib/types";

const NEXT_STAGES: Record<LeadStage, LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["SITE_VISIT", "NEGOTIATION", "LOST"],
  SITE_VISIT: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["SITE_VISIT", "LOST"],
  BOOKED: [],
  LOST: ["CONTACTED"],
};

export function LeadDetailDialog({
  lead,
  open,
  onOpenChange,
  canManage,
  bookingHref,
}: {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  bookingHref?: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<LeadStage>("CONTACTED");
  const [lostReason, setLostReason] = useState("");
  const [activity, setActivity] = useState({
    type: "CALL",
    note: "",
    outcome: "",
    nextFollowUpAt: "",
  });

  useEffect(() => {
    if (!open || !lead) return;
    setLoading(true);
    setDetail(null);
    fetch(`/api/leads/${lead.id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load lead");
        setDetail(data);
        setStage(NEXT_STAGES[data.stage as LeadStage][0] ?? data.stage);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load lead"))
      .finally(() => setLoading(false));
  }, [open, lead]);

  async function addActivity(event: React.FormEvent) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...activity,
          nextFollowUpAt: activity.nextFollowUpAt || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to log activity");
      toast.success("Activity logged");
      setActivity({ type: "CALL", note: "", outcome: "", nextFollowUpAt: "" });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to log activity");
    } finally {
      setSaving(false);
    }
  }

  async function moveStage() {
    if (!lead) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, lostReason: stage === "LOST" ? lostReason : undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to move lead");
      toast.success(`Lead moved to ${stage.toLowerCase().replaceAll("_", " ")}`);
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move lead");
    } finally {
      setSaving(false);
    }
  }

  async function convertAndBook() {
    if (!lead) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to convert lead");
      toast.success("Lead converted to customer", { description: "Choose the unit and commercial terms to create the booking." });
      onOpenChange(false);
      // Pass the interested unit through so SellAssetDialog pre-selects it —
      // the sales manager doesn't have to re-find the unit the lead already chose.
      const unitParam = current.interestedUnitId ? `&unit=${current.interestedUnitId}` : "";
      router.push(bookingHref ? `${bookingHref}?customerId=${data.customerId}${unitParam}` : `/sales?tab=sales&newSale=1&customer=${data.customerId}${unitParam}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to convert lead");
    } finally {
      setSaving(false);
    }
  }

  if (!lead) return null;
  const current = detail ?? lead;
  const canConvert = current.stage === "SITE_VISIT" || current.stage === "NEGOTIATION";
  const nextStages = NEXT_STAGES[current.stage];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={current.name}
      description={`${current.phone} · ${current.projectName ?? "Project not selected"}`}
      size="lg"
      action={canManage && canConvert ? (
        <Button size="sm" onClick={convertAndBook} disabled={saving}>
          <UserRoundCheck className="size-4" /> Convert & book
        </Button>
      ) : undefined}
    >
      {loading ? (
        <p className="py-12 text-center text-body text-muted-foreground">Loading lead…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={current.stage} />
            <StatusPill status={current.priority} />
            <span className="text-meta text-muted-foreground">{current.source.replaceAll("_", " ")}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 sm:grid-cols-4">
            <Figure label="Lead score" value={`${current.score}/100`} provenance="Source, priority, budget completeness, project/unit interest and recorded engagement." />
            <Figure label="Budget from" value={current.budgetMin == null ? "—" : formatCurrency(current.budgetMin)} />
            <Figure label="Budget to" value={current.budgetMax == null ? "—" : formatCurrency(current.budgetMax)} />
            <Figure label="Activities" value={current.activityCount} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-label text-muted-foreground">Interest</p>
              <p className="mt-1 text-body font-medium">{current.interestedUnitLabel ?? current.interestedUnitType ?? "Not narrowed to a unit"}</p>
              <p className="mt-0.5 text-meta text-muted-foreground">{current.projectName ?? "Any project"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-label text-muted-foreground">Next action</p>
              <p className="mt-1 text-body font-medium">{current.nextFollowUpAt ? formatDate(current.nextFollowUpAt) : "No follow-up scheduled"}</p>
              <p className="mt-0.5 text-meta text-muted-foreground">Owner: {current.assignedToName ?? "Unassigned"}</p>
            </div>
          </div>

          {current.notes && <div className="rounded-lg bg-muted/50 p-3 text-body">{current.notes}</div>}
          {current.lostReason && <div className="rounded-lg border border-danger/30 bg-danger-soft/30 p-3 text-body text-danger">Lost: {current.lostReason}</div>}

          {canManage && current.stage !== "BOOKED" && (
            <form onSubmit={addActivity} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="size-4 text-muted-foreground" />
                <h3 className="text-section">Log the interaction</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-activity-type">Type</Label>
                  <Select id="lead-activity-type" value={activity.type} onChange={(event) => setActivity((value) => ({ ...value, type: event.target.value }))}>
                    <option value="CALL">Call</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">Email</option>
                    <option value="MEETING">Meeting</option>
                    <option value="SITE_VISIT">Site visit</option>
                    <option value="NOTE">Note</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-next-followup">Next follow-up</Label>
                  <Input id="lead-next-followup" type="datetime-local" value={activity.nextFollowUpAt} onChange={(event) => setActivity((value) => ({ ...value, nextFollowUpAt: event.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-outcome">Outcome</Label>
                  <Input id="lead-outcome" value={activity.outcome} onChange={(event) => setActivity((value) => ({ ...value, outcome: event.target.value }))} placeholder="Interested, no answer, visit confirmed…" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-activity-note">Note</Label>
                  <Textarea id="lead-activity-note" value={activity.note} onChange={(event) => setActivity((value) => ({ ...value, note: event.target.value }))} rows={2} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || (!activity.note.trim() && !activity.outcome.trim())}>
                  <Phone className="size-4" /> {saving ? "Saving…" : "Save interaction"}
                </Button>
              </div>
            </form>
          )}

          {canManage && nextStages.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                <h3 className="text-section">Move the opportunity</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-stage">Next stage</Label>
                  <Select id="lead-stage" value={stage} onChange={(event) => setStage(event.target.value as LeadStage)}>
                    {nextStages.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-lost-reason">{stage === "LOST" ? "Lost reason *" : "What happens next"}</Label>
                  <Input id="lead-lost-reason" value={lostReason} onChange={(event) => setLostReason(event.target.value)} disabled={stage !== "LOST"} placeholder={stage === "LOST" ? "Budget, location, competitor…" : "Record the interaction above before moving"} />
                </div>
                <Button type="button" onClick={moveStage} disabled={saving || (stage === "LOST" && !lostReason.trim())}>Move lead</Button>
              </div>
            </div>
          )}

          {detail && detail.activities.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-section">Activity</h3>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {detail.activities.map((item) => (
                  <div key={item.id} className="flex gap-3 p-3">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-info" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-body font-medium">{item.type.replaceAll("_", " ")}</p>
                        <p className="text-caption text-muted-foreground">{formatDate(item.occurredAt)}</p>
                      </div>
                      {item.outcome && <p className="mt-1 text-body">{item.outcome}</p>}
                      {item.note && <p className="mt-0.5 text-meta text-muted-foreground">{item.note}</p>}
                      {item.nextFollowUpAt && <p className="mt-1 flex items-center gap-1 text-caption text-warning"><CalendarClock className="size-3" /> Follow up {formatDate(item.nextFollowUpAt)}</p>}
                      {item.createdByName && <p className="mt-1 text-caption text-muted-foreground">by {item.createdByName}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
