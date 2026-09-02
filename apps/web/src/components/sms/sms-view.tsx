"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Plus, Link2, Check, X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

export type SmsRow = {
  id: string;
  sender: string;
  message: string;
  receivedAt: string;
  amount: number | null;
  upiRef: string | null;
  bankName: string | null;
  txnType: string | null;
  counterparty: string | null;
  status: string;
  matchedEntityType: string | null;
  matchedEntityId: string | null;
  paymentRecordId: string | null;
  matchConfidence: number | null;
  matchReason: string | null;
};

const STATUS_STYLES: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  MATCHED: { color: "text-success bg-success/10", label: "Matched", icon: <Check className="h-3 w-3" /> },
  UNMATCHED: { color: "text-warning bg-warning/10", label: "Unmatched", icon: <AlertCircle className="h-3 w-3" /> },
  IGNORED: { color: "text-muted-foreground bg-muted", label: "Ignored", icon: <X className="h-3 w-3" /> },
  ERROR: { color: "text-danger bg-danger/10", label: "Error", icon: <AlertCircle className="h-3 w-3" /> },
};

export function SmsView({ items, canCreate }: { items: SmsRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [ingestOpen, setIngestOpen] = useState(false);
  const [matchTarget, setMatchTarget] = useState<SmsRow | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const filtered = filter === "ALL" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {["ALL", "UNMATCHED", "MATCHED", "IGNORED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-caption font-medium transition-colors ${
              filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-subtle"
            }`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            {f !== "ALL" && (
              <span className="ml-1.5 opacity-60">
                {items.filter((i) => i.status === f).length}
              </span>
            )}
          </button>
        ))}
        {canCreate && (
          <Button size="sm" className="ml-auto" onClick={() => setIngestOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add SMS
          </Button>
        )}
      </div>

      {/* SMS list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No SMS records"
          description="Forward bank payment SMS to auto-create payment entries."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((sms) => {
            const statusStyle = STATUS_STYLES[sms.status] ?? STATUS_STYLES.ERROR!;
            return (
              <div
                key={sms.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  {/* Status badge */}
                  <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-micro font-medium ${statusStyle.color}`}>
                    {statusStyle.icon}
                    {statusStyle.label}
                  </span>

                  {/* SMS content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {sms.amount != null && (
                        <span className="text-body font-semibold text-foreground tnum">
                          {formatCurrency(sms.amount)}
                        </span>
                      )}
                      {sms.bankName && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                          {sms.bankName}
                        </span>
                      )}
                      {sms.txnType && (
                        <span className={`text-micro font-medium ${
                          sms.txnType === "CREDIT" ? "text-success" : "text-muted-foreground"
                        }`}>
                          {sms.txnType}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground line-clamp-2">
                      {sms.message}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-micro text-muted-foreground">
                      <span>{sms.sender}</span>
                      <span>{formatDate(sms.receivedAt)}</span>
                      {sms.upiRef && <span>UPI: {sms.upiRef}</span>}
                      {sms.counterparty && <span>From: {sms.counterparty}</span>}
                    </div>
                    {sms.matchReason && (
                      <p className="mt-1 text-micro italic text-muted-foreground">
                        {sms.matchReason}
                        {sms.matchConfidence != null && ` (${sms.matchConfidence}% confidence)`}
                      </p>
                    )}
                  </div>

                  {/* Action: manual match for unmatched */}
                  {sms.status === "UNMATCHED" && sms.amount != null && canCreate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMatchTarget(sms)}
                    >
                      <Link2 className="h-3.5 w-3.5" /> Match
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ingest dialog */}
      {ingestOpen && (
        <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} onDone={() => router.refresh()} />
      )}

      {/* Manual match dialog */}
      {matchTarget && (
        <MatchDialog
          sms={matchTarget}
          onClose={() => setMatchTarget(null)}
          onDone={() => { setMatchTarget(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Ingest dialog — paste SMS text ──

function IngestDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sender.trim() || !message.trim()) {
      toast.error("Sender and message are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: sender.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to ingest SMS");
      const r = data.results?.[0];
      if (r?.status === "MATCHED") {
        toast.success(`SMS matched to ${r.matchedEntityType}`, {
          description: `Auto-created payment of ${formatCurrency(Number(r.amount))}`,
        });
      } else if (r?.duplicate) {
        toast.info("Duplicate SMS — already processed");
      } else if (r?.status === "UNMATCHED") {
        toast.warning("SMS ingested but no matching payment found", {
          description: r.matchReason,
        });
      } else {
        toast.info(`SMS ingested (${r?.status})`);
      }
      setSender("");
      setMessage("");
      onOpenChange(false);
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to ingest SMS");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Bank SMS"
      description="Paste a bank SMS notification to auto-parse and match it to an outstanding payment."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sms-sender">Sender ID</Label>
          <Input
            id="sms-sender"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="e.g. HD-FBANK, ICICIB, SBI"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sms-message">SMS Message</Label>
          <Textarea
            id="sms-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste the full SMS text here…"
            rows={5}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Processing…" : "Parse & Match"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Manual match dialog ──

function MatchDialog({
  sms,
  onClose,
  onDone,
}: {
  sms: SmsRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [entityType, setEntityType] = useState<"ASSET_SALE" | "MATERIAL_SALE" | "TENANCY">("ASSET_SALE");
  const [entityId, setEntityId] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!entityId.trim()) {
      toast.error("Entity ID is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sms/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsId: sms.id, entityType, entityId: entityId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to match SMS");
      toast.success("SMS matched and payment created");
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to match SMS");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={onClose}
      title="Match SMS to Payment"
      description={`Link this ${sms.amount ? formatCurrency(sms.amount) : "unknown amount"} SMS to a sale or tenancy.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="match-type">Payment Type</Label>
          <Select
            id="match-type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as typeof entityType)}
          >
            <option value="ASSET_SALE">Asset Sale (property/unit sale)</option>
            <option value="MATERIAL_SALE">Material Sale</option>
            <option value="TENANCY">Tenancy (rent payment)</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="match-id">Sale / Tenancy ID</Label>
          <Input
            id="match-id"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="Paste the ID of the sale or tenancy"
            required
          />
          <p className="text-micro text-muted-foreground">
            You can find the ID in the URL of the sale/tenancy detail page.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Matching…" : "Create Payment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
