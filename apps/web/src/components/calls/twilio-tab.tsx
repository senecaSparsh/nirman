"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Section,
  StatusPill,
  Callout,
} from "@/components/page";
import {
  ShieldCheck,
  AlertCircle,
  Loader2,
  Cloud,
  RefreshCw,
  Link2,
  Unlink,
  PhoneCall,
  CheckCircle2,
} from "lucide-react";

interface TwilioNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  voiceUrl: string | null;
  statusCallback: string | null;
  synced: boolean;
  webhookConfigured: boolean;
}

interface TwilioStatus {
  configured: boolean;
  accountSid?: string;
  account?: { sid: string; friendlyName: string; status: string; type: string } | null;
  numbers: TwilioNumber[];
  syncedCount: number;
  unsyncedCount: number;
  syncedNumbers?: { id: string; phoneNumber: string; providerNumberId: string; label: string | null; assignedTo: { id: string; name: string } | null; status: string }[];
}

export function TwilioTab() {
  const [status, setStatus] = useState<TwilioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telephony/twilio/status");
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not fetch Twilio status.");
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStatus(); /* eslint-disable-next-line */ }, []);

  async function syncNumbers() {
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/telephony/twilio/sync-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configureWebhooks: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not sync numbers.");
        return;
      }
      const data = await res.json();
      setSuccess(`Synced ${data.synced} numbers (${data.created} new, ${data.updated} updated). Webhooks configured.`);
      await fetchStatus();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setActionLoading(false);
    }
  }

  async function syncCalls() {
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/telephony/twilio/sync-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not sync calls.");
        return;
      }
      const data = await res.json();
      setSuccess(`Synced ${data.total} calls: ${data.created} new, ${data.updated} updated, ${data.skipped} skipped (not our numbers).`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setActionLoading(false);
    }
  }

  async function configureWebhook(numberSid: string, action: "configure" | "clear") {
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/telephony/twilio/configure-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyPhoneId: numberSid, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not configure webhook.");
        return;
      }
      setSuccess(action === "configure" ? "Webhook configured." : "Webhook cleared.");
      await fetchStatus();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <Section title="Owner Access Only">
        <div className="p-6 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-warning" />
            <h3 className="text-body font-medium">Owner Access Only</h3>
          </div>
          <p className="text-meta text-muted-foreground">
            The Twilio integration is restricted to the company owner. Only the owner can connect Twilio, sync numbers, configure webhooks, and view call history from Twilio.
          </p>
        </div>
      </Section>
    );
  }

  if (error && !status) {
    return (
      <Section title="Twilio">
        <div className="p-6">
          <p className="flex items-center gap-2 text-caption text-danger">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
          <Button size="sm" variant="ghost" className="mt-3" onClick={fetchStatus}>Retry</Button>
        </div>
      </Section>
    );
  }

  if (!status?.configured) {
    return (
      <Section title="Twilio Not Configured">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-body font-medium">Twilio Not Configured</h3>
          </div>
          <p className="text-meta text-muted-foreground">
            To connect your Twilio account, add these environment variables to the server:
          </p>
          <pre className="rounded-md bg-muted p-3 text-micro text-muted-foreground overflow-x-auto">
{`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
          </pre>
          <p className="text-meta text-muted-foreground">
            Only the owner can see and manage the Twilio integration.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Owner-only notice */}
      <Callout
        tone="warning"
        icon={<ShieldCheck />}
        title="Owner-only area"
      >
        Only you can see and manage the Twilio connection.
      </Callout>

      {/* Account info */}
      <Section title="Twilio Account">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-brand" />
              <span className="text-body font-medium text-foreground">
                {status.account?.friendlyName ?? "Twilio Account"}
              </span>
            </div>
            <StatusPill status={status.account?.status?.toUpperCase() ?? "UNKNOWN"} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-label text-muted-foreground">Type</p>
              <p className="mt-0.5 text-body font-medium text-foreground">{status.account?.type ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-label text-muted-foreground">SID</p>
              <p className="mt-0.5 text-caption font-medium text-foreground">
                <code>{status.accountSid}</code>
              </p>
            </div>
            <div>
              <p className="text-label text-muted-foreground">Numbers</p>
              <p className="mt-0.5 text-body font-medium text-foreground">
                {status.syncedCount} synced · {status.unsyncedCount} pending
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={syncNumbers} disabled={actionLoading}>
          {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync Numbers + Webhooks
        </Button>
        <Button size="sm" variant="outline" onClick={syncCalls} disabled={actionLoading}>
          {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
          Sync Recent Calls
        </Button>
        <Button size="sm" variant="ghost" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <Callout tone="danger" icon={<AlertCircle />}>
          {error}
        </Callout>
      )}
      {success && (
        <Callout tone="success" icon={<CheckCircle2 />}>
          {success}
        </Callout>
      )}

      {/* Numbers list */}
      <Section
        title="Twilio Numbers"
        description={`${status.syncedCount} synced to your company · ${status.unsyncedCount} not yet synced`}
      >
        {status.numbers.length === 0 ? (
          <div className="p-8 text-center">
            <Cloud className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-body text-foreground">No phone numbers on this Twilio account</p>
            <p className="mt-1 text-caption text-muted-foreground">
              Buy a number in the Twilio console first.
            </p>
          </div>
        ) : (
          <table className="w-full text-body">
            <thead className="sticky top-0 z-10 bg-subtle backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border-strong">
              <tr>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Number</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Capabilities</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Synced</th>
                <th className="h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground">Webhook</th>
                <th className="h-9 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {status.numbers.map((num) => {
                const syncedPhone = status.syncedNumbers?.find((s) => s.providerNumberId === num.sid);
                return (
                  <tr key={num.sid} className="group border-b border-border transition-colors last:border-0 hover:bg-subtle">
                    <td className="px-3 py-2.5 align-middle">
                      <p className="font-medium text-foreground">{num.phoneNumber}</p>
                      {num.friendlyName && (
                        <p className="text-caption text-muted-foreground">{num.friendlyName}</p>
                      )}
                      {syncedPhone?.assignedTo && (
                        <p className="text-caption text-brand">→ {syncedPhone.assignedTo.name}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex gap-1">
                        {num.capabilities.voice && <Badge variant="muted" size="sm">Voice</Badge>}
                        {num.capabilities.sms && <Badge variant="muted" size="sm">SMS</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {num.synced ? (
                        <Badge variant="success" dot>Synced</Badge>
                      ) : (
                        <Badge variant="muted" dot>Not synced</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {num.webhookConfigured ? (
                        <span className="inline-flex items-center gap-1 text-caption text-success">
                          <Link2 className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                          <Unlink className="h-3.5 w-3.5" /> Not set
                        </span>
                      )}
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-1.5 text-right align-middle [&>*]:opacity-0 [&>*]:transition-opacity group-hover:[&>*]:opacity-100 group-focus-within:[&>*]:opacity-100">
                      {syncedPhone && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => configureWebhook(syncedPhone.id, num.webhookConfigured ? "clear" : "configure")}
                          disabled={actionLoading}
                        >
                          {num.webhookConfigured ? "Clear webhook" : "Set webhook"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* How it works */}
      <Section title="How Twilio integration works">
        <div className="p-4 space-y-2">
          <ul className="space-y-1.5 text-caption text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span><b className="text-foreground">Sync Numbers</b> — imports all Twilio numbers into your company phone list. You can then assign them to staff in the Numbers tab.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span><b className="text-foreground">Sync Calls</b> — backfills recent Twilio call history into your call log (read-only, no credits used).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span><b className="text-foreground">Webhooks</b> — when configured, Twilio sends real-time call events to our server. New calls appear automatically.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span><b className="text-foreground">Multi-number</b> — each Twilio number is a separate company phone. Assign different numbers to different staff (sales, support, site office).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span><b className="text-foreground">Owner-only</b> — only the owner can connect Twilio, sync numbers, and configure webhooks. Other staff just see the calls.</span>
            </li>
          </ul>
        </div>
      </Section>
    </div>
  );
}
