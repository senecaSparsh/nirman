"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Plus, Link2, Check, X, AlertCircle, Loader2, Upload, Smartphone, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useFetch } from "@/lib/use-fetch";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate, formatEnumLabel } from "@/lib/utils";
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

export function SmsView({ items, canCreate, canManage }: { items: SmsRow[]; canCreate: boolean; canManage?: boolean }) {
  const router = useRouter();
  const [ingestOpen, setIngestOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [autoFwdOpen, setAutoFwdOpen] = useState(false);
  const [matchTarget, setMatchTarget] = useState<SmsRow | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [ignoring, setIgnoring] = useState<string | null>(null);

  const filtered = filter === "ALL" ? items : items.filter((i) => i.status === filter);

  async function ignoreSmsRow(id: string) {
    setIgnoring(id);
    try {
      const res = await fetch(`/api/sms/${id}/ignore`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        toast.error(b?.error ?? "Could not ignore this SMS");
        return;
      }
      router.refresh();
    } finally {
      setIgnoring(null);
    }
  }

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
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAutoFwdOpen(true)}>
              <Smartphone className="h-3.5 w-3.5" /> Auto-forward
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import statement
            </Button>
            <Button size="sm" onClick={() => setIngestOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add SMS
            </Button>
          </div>
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMatchTarget(sms)}
                      >
                        <Link2 className="h-3.5 w-3.5" /> Match
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ignoring === sms.id}
                        onClick={() => ignoreSmsRow(sms.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                        {ignoring === sms.id ? "Ignoring…" : "Ignore"}
                      </Button>
                    </div>
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
      {importOpen && (
        <StatementImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => router.refresh()} />
      )}
      {autoFwdOpen && (
        <AutoForwardDialog open={autoFwdOpen} onOpenChange={setAutoFwdOpen} canManage={canManage ?? false} />
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

// ── Auto-forward setup — device keys + forwarder-app instructions ──

type SmsKey = { id: string; label: string | null; masked: string; lastUsedAt: string | null; createdAt: string };

type SmsStatus = {
  connected: boolean;
  devices: Array<{ id: string; label: string | null; masked: string; lastUsedAt: string | null; live: boolean }>;
  outbox: {
    queued: number;
    sent: number;
    failed: number;
    lastSentAt: string | null;
    recentFailures: Array<{ id: string; toPhone: string; error: string | null; updatedAt: string }>;
  };
};

function AutoForwardDialog({ open, onOpenChange, canManage }: { open: boolean; onOpenChange: (v: boolean) => void; canManage: boolean }) {
  const { data, loading, retry: refetch } = useFetch<{ keys: SmsKey[] }>("/api/sms/keys");
  const { data: status } = useFetch<SmsStatus>("/api/sms/status");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const intakeUrl = typeof window !== "undefined" ? `${window.location.origin}/api/sms/intake` : "/api/sms/intake";

  async function createKey() {
    setCreating(true);
    try {
      const res = await fetch("/api/sms/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to create key");
      setFreshToken(d.token);
      setNewLabel("");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/sms/keys?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to revoke");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(null);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Auto-forward bank SMS" className="max-w-lg">
      <div className="space-y-4">
        {/* Live device status — visible proof the phone is talking to Nirman */}
        {status && (
          <div className={`rounded-md border p-2.5 text-caption ${
            status.connected ? "border-success bg-success/10" : "border-border bg-subtle"
          }`}>
            {status.connected ? (
              <p className="flex items-center gap-1.5 font-medium text-success">
                <Smartphone className="h-3.5 w-3.5" /> Phone connected — syncing now
              </p>
            ) : status.devices.length > 0 ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" /> {status.devices.length} device{status.devices.length > 1 ? "s" : ""} registered — none seen in the last 15 min. Open the Nirman app on the phone.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" /> No phone connected yet — log in to the Nirman app on a company phone.
              </p>
            )}
            {(status.outbox.queued > 0 || status.outbox.failed > 0) && (
              <p className="mt-1 text-micro text-muted-foreground">
                Outgoing: {status.outbox.queued} queued · {status.outbox.sent} sent
                {status.outbox.failed > 0 && <span className="text-danger"> · {status.outbox.failed} failed</span>}
              </p>
            )}
            {status.outbox.recentFailures.map((f) => (
              <p key={f.id} className="mt-0.5 text-micro text-danger">
                → {f.toPhone}: {f.error}
              </p>
            ))}
          </div>
        )}

        <p className="text-caption text-muted-foreground">
          Bank SMS reaches Nirman automatically — no manual paste. The easiest setup is the Nirman app:
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-caption text-foreground">
          <li>Install the <b>Nirman app</b> on a company phone and log in — it registers itself (no key to paste).</li>
          <li>Tap <b>Allow</b> on the SMS permission once — done. Bank SMS forwards itself, and the phone can send your OTPs and alerts on its own SIM.</li>
          <li>Or for a third-party forwarder app: create a device key below and POST SMS to the URL with header <code className="rounded bg-subtle px-1">x-sms-key: &lt;key&gt;</code>.</li>
        </ol>
        <p className="rounded-md border border-border bg-subtle p-2.5 text-caption text-muted-foreground">
          The same Nirman-app phone also <b>sends</b> your OTP codes and alerts for free — they queue automatically and the
          phone delivers them on its own SIM. A standalone <b>SMS Gateway for Android</b> app works too —
          <b>Settings → Integrations → SMS Gateway</b>.
        </p>

        <div className="rounded-md border border-border p-2.5">
          <p className="text-micro text-muted-foreground mb-1">Intake URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-caption">{intakeUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(intakeUrl)}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {freshToken && (
          <div className="rounded-md border border-success bg-success/10 p-2.5">
            <p className="text-micro font-medium text-success mb-1">Key created — copy it now, it won&apos;t be shown again</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-caption">{freshToken}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(freshToken)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div>
          <p className="text-micro text-muted-foreground mb-1.5">Device keys</p>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : data?.keys.length === 0 ? (
            <p className="text-caption text-muted-foreground">None yet — create one for each phone that will forward SMS.</p>
          ) : (
            <div className="space-y-1.5">
              {data?.keys.map((k) => (
                <div key={k.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  <span className="flex-1 truncate text-caption font-medium">{k.label || "Device"} <span className="font-normal text-muted-foreground">{k.masked}</span></span>
                  <span className="text-micro text-muted-foreground">{k.lastUsedAt ? `last used ${formatDate(k.lastUsedAt)}` : "never used"}</span>
                  {canManage && (
                    <Button size="sm" variant="ghost" disabled={revoking === k.id} onClick={() => revokeKey(k.id)}>
                      {revoking === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canManage && (
            <div className="mt-2 flex gap-2">
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label — e.g. Accounts phone" className="h-8 text-caption" />
              <Button size="sm" disabled={creating} onClick={createKey}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Key
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
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
        toast.info(`SMS ingested (${formatEnumLabel(r?.status)})`);
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

type Receivable = {
  entityType: "ASSET_SALE" | "MATERIAL_SALE" | "TENANCY";
  entityId: string;
  label: string;
  sublabel: string;
  due: number;
};

const RECEIVABLE_TYPE_LABEL: Record<Receivable["entityType"], string> = {
  ASSET_SALE: "Unit sale",
  MATERIAL_SALE: "Material sale",
  TENANCY: "Rent",
};

function MatchDialog({
  sms,
  onClose,
  onDone,
}: {
  sms: SmsRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error } = useFetch<{ items?: Receivable[] }>("/api/sms/receivables");
  const items = error ? [] : data ? (data.items ?? []) : null;

  async function pick(item: Receivable) {
    if (busy) return;
    setBusy(item.entityId);
    try {
      const res = await fetch("/api/sms/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsId: sms.id, entityType: item.entityType, entityId: item.entityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to match SMS");
      toast.success(`Matched to ${item.label} — payment recorded`);
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to match SMS");
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={onClose}
      title="Match SMS to Payment"
      description={`Link this ${sms.amount ? formatCurrency(sms.amount) : "unknown amount"} SMS to an outstanding payment.`}
    >
      <div className="max-h-80 overflow-y-auto -mx-1 px-1">
        {items === null ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No outstanding payments to match against.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {items.map((item) => (
              <button
                key={`${item.entityType}-${item.entityId}`}
                type="button"
                onClick={() => pick(item)}
                disabled={!!busy}
                className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">
                    {item.label}
                  </span>
                  <span className="block text-micro text-muted-foreground truncate">
                    {RECEIVABLE_TYPE_LABEL[item.entityType]} · {item.sublabel}
                  </span>
                </span>
                {busy === item.entityId ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                ) : (
                  <span className="text-sm font-bold tabular-nums shrink-0 text-danger">
                    {formatCurrency(item.due)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={!!busy}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}


// ── Statement import — the monthly CA workflow ──

function StatementImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a CSV/TSV statement file");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bank-statements/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(
        `${data.created} rows imported — ${data.credits} credits, ${data.matched} auto-matched`,
        data.deduped > 0 ? { description: `${data.deduped} duplicates skipped` } : undefined,
      );
      setFile(null);
      onOpenChange(false);
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import Bank Statement"
      description="Upload a CSV/TSV from the bank portal. Credit rows run through the same auto-matcher as bank SMS."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Statement file</label>
          <input aria-label="Statement file"
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            required
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Columns: Date · Narration · Reference · Debit · Credit. Re-importing the same file skips duplicates.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Importing…" : "Import"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}