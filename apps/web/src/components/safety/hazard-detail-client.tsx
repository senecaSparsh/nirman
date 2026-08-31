"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/lib/use-confirm";
import { formatDate } from "@/lib/utils";
import { statusBadgeVariant } from "@/components/page";
import {Shield, Check, Trash2, Loader2} from "lucide-react";

interface HazardDetail {
  id: string; hazardNumber: string; title: string; description: string;
  status: string; riskLevel: string; likelihood: number; severity: number;
  projectName: string; location: string | null; wbsNodeName: string | null;
  mitigationPlan: string | null; resolutionNotes: string | null;
  targetResolutionDate: string | null;
  attachments: string[];
  identifiedAt: string; identifiedByName: string | null;
  mitigatedAt: string | null; mitigatedByName: string | null;
  resolvedAt: string | null; resolvedByName: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified", MITIGATING: "Mitigating", RESOLVED: "Resolved", CLOSED: "Closed",
};
const RISK_VARIANTS: Record<string, "default" | "warning" | "danger"> = {
  LOW: "default", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger",
};
const RISK_MATRIX = (likelihood: number, severity: number): string => {
  const score = likelihood * severity;
  if (score >= 15) return "CRITICAL";
  if (score >= 8) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
};

export function HazardDetailClient({ hazard, canManage }: { hazard: HazardDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showMitigate, setShowMitigate] = useState(false);
  const [mitigationPlan, setMitigationPlan] = useState(hazard.mitigationPlan ?? "");
  const [showResolve, setShowResolve] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState(hazard.resolutionNotes ?? "");

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/safety/hazards/${hazard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Hazard ${action}d`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
      setShowMitigate(false);
      setShowResolve(false);
    }
  }

  const computedRisk = RISK_MATRIX(hazard.likelihood, hazard.severity);
  const isResolved = hazard.status === "RESOLVED" || hazard.status === "CLOSED";

  return (
    <div className="space-y-4">
      {/* Status + risk badges */}
      <div className="flex items-center gap-2">
        <Badge variant={statusBadgeVariant(hazard.status)}>
          {STATUS_LABELS[hazard.status] ?? hazard.status}
        </Badge>
        <Badge variant={RISK_VARIANTS[hazard.riskLevel] ?? "default"}>
          {hazard.riskLevel} Risk
        </Badge>
        {hazard.targetResolutionDate && !isResolved && (
          <span className="text-caption text-muted-foreground">
            Target: {formatDate(hazard.targetResolutionDate)}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="rounded-lg border p-3 space-y-1">
        <p className="text-label font-semibold text-muted-foreground">Description</p>
        <p className="text-body text-foreground">{hazard.description}</p>
      </div>

      {/* Risk assessment */}
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-label font-semibold text-muted-foreground">Risk Assessment</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-micro text-muted-foreground">Likelihood</p>
            <p className="text-body font-semibold tnum text-foreground">{hazard.likelihood}/5</p>
          </div>
          <div>
            <p className="text-micro text-muted-foreground">Severity</p>
            <p className="text-body font-semibold tnum text-foreground">{hazard.severity}/5</p>
          </div>
          <div>
            <p className="text-micro text-muted-foreground">Score</p>
            <p className={`text-body font-semibold tnum ${RISK_VARIANTS[computedRisk] === "danger" ? "text-danger" : RISK_VARIANTS[computedRisk] === "warning" ? "text-warning" : "text-foreground"}`}>
              {hazard.likelihood * hazard.severity}
            </p>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project"><span className="text-body text-foreground">{hazard.projectName}</span></Field>
        {hazard.location && <Field label="Location"><span className="text-body text-foreground">{hazard.location}</span></Field>}
        {hazard.wbsNodeName && <Field label="WBS Node"><span className="text-body text-foreground">{hazard.wbsNodeName}</span></Field>}
      </div>

      {/* Mitigation plan */}
      {hazard.mitigationPlan && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-label font-semibold text-muted-foreground">Mitigation Plan</p>
          <p className="text-body text-foreground">{hazard.mitigationPlan}</p>
          {hazard.mitigatedAt && (
            <p className="text-micro text-muted-foreground">
              Mitigated on {formatDate(hazard.mitigatedAt)} by {hazard.mitigatedByName ?? "—"}
            </p>
          )}
        </div>
      )}

      {/* Resolution notes */}
      {hazard.resolutionNotes && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-label font-semibold text-muted-foreground">Resolution Notes</p>
          <p className="text-body text-foreground">{hazard.resolutionNotes}</p>
          {hazard.resolvedAt && (
            <p className="text-micro text-muted-foreground">
              Resolved on {formatDate(hazard.resolvedAt)} by {hazard.resolvedByName ?? "—"}
            </p>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-label font-semibold text-muted-foreground">Timeline</p>
        <div className="space-y-1.5">
          <TimelineRow label="Identified" date={hazard.identifiedAt} name={hazard.identifiedByName} />
          {hazard.mitigatedAt && <TimelineRow label="Mitigated" date={hazard.mitigatedAt} name={hazard.mitigatedByName} />}
          {hazard.resolvedAt && <TimelineRow label="Resolved" date={hazard.resolvedAt} name={hazard.resolvedByName} />}
        </div>
      </div>

      {/* Attachments */}
      {hazard.attachments.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-label font-semibold text-muted-foreground">Attachments ({hazard.attachments.length})</p>
          <div className="grid grid-cols-3 gap-2">
            {hazard.attachments.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded photo */}
                <img src={url} alt={`Attachment ${i + 1}`} className="aspect-square w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {hazard.status === "IDENTIFIED" && (
            <Button onClick={() => setShowMitigate(true)} disabled={acting !== null}>
              <Shield className="h-4 w-4" /> Start Mitigation
            </Button>
          )}
          {hazard.status === "MITIGATING" && (
            <Button onClick={() => setShowResolve(true)} disabled={acting !== null}>
              <Check className="h-4 w-4" /> Resolve
            </Button>
          )}
          {!isResolved && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!(await confirm({ title: "Delete hazard?", description: `Delete "${hazard.title}"? This cannot be undone.` }))) return;
                await doAction("delete");
                router.push("/safety");
              }}
              disabled={acting !== null}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      )}

      {/* Mitigate dialog */}
      {showMitigate && (
        <Dialog
          open={showMitigate}
          onOpenChange={setShowMitigate}
          title="Start Mitigation"
          description="Describe how this hazard will be controlled."
          footer={
            <>
              <Button variant="outline" onClick={() => setShowMitigate(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!mitigationPlan.trim()) { toast.error("Mitigation plan is required"); return; }
                  doAction("mitigate", { mitigationPlan });
                }}
                disabled={acting !== null}
              >
                {acting === "mitigate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Start Mitigation
              </Button>
            </>
          }
        >
          <Field label="Mitigation Plan">
            <Textarea
              value={mitigationPlan}
              onChange={(e) => setMitigationPlan(e.target.value)}
              rows={4}
              placeholder="How will this hazard be controlled?"
            />
          </Field>
        </Dialog>
      )}

      {/* Resolve dialog */}
      {showResolve && (
        <Dialog
          open={showResolve}
          onOpenChange={setShowResolve}
          title="Resolve Hazard"
          description="Confirm the hazard has been resolved."
          footer={
            <>
              <Button variant="outline" onClick={() => setShowResolve(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!resolutionNotes.trim()) { toast.error("Resolution notes are required"); return; }
                  doAction("resolve", { resolutionNotes });
                }}
                disabled={acting !== null}
              >
                {acting === "resolve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Resolve
              </Button>
            </>
          }
        >
          <Field label="Resolution Notes">
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
              placeholder="How was the hazard resolved?"
            />
          </Field>
        </Dialog>
      )}

      {confirmDialog}
    </div>
  );
}

function TimelineRow({ label, date, name }: { label: string; date: string; name: string | null }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="text-foreground">{formatDate(date)}</div>
        {name && <div className="text-micro text-muted-foreground">{name}</div>}
      </div>
    </div>
  );
}
