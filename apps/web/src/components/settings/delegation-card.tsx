"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { UserCheck, CalendarDays, Loader2, ArrowRight, XCircle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { formatDate, formatEnumLabel } from "@/lib/utils";
import { swrFetcher } from "@/lib/swr";

/**
 * DelegationCard — "out of office" authority handoff.
 *
 * Any member can hand their authority (role permissions + approval rank)
 * to another member of the same company until an end date. While active,
 * the delegate's approvals and permission checks resolve with the
 * delegator's authority, and audit rows record "on behalf of".
 *
 * OWNER/ADMIN additionally see every delegation in the company and can
 * clear any of them.
 */

interface DelegationData {
  mine: {
    delegateName: string | null;
    delegateUserId: string | null;
    endsAt: string | null;
    startedAt: string | null;
    note: string | null;
    expired: boolean;
  } | null;
  incoming: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    endsAt: string | null;
    note: string | null;
  }[];
  delegations: {
    membershipId: string;
    userId: string;
    name: string;
    role: string;
    delegateName: string | null;
    endsAt: string | null;
    note: string | null;
    expired: boolean;
  }[];
  members: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    designation: string | null;
  }[];
  isAdmin: boolean;
}

export function DelegationCard() {
  const { data, mutate, isLoading } = useSWR<DelegationData>("/api/delegation", swrFetcher);
  const [delegateId, setDelegateId] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!delegateId || !endsAt) {
      toast.error("Pick a person and an end date");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/delegation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delegateMembershipId: delegateId,
          endsAt: new Date(endsAt + "T23:59:59").toISOString(),
          note: note || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to delegate");
      toast.success("Authority delegated");
      setDelegateId("");
      setEndsAt("");
      setNote("");
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delegate");
    } finally {
      setBusy(false);
    }
  };

  const clear = async (membershipId?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/delegation", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(membershipId ? { membershipId } : {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      toast.success("Delegation cleared");
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="size-5" />
          Out of office — delegate my authority
        </CardTitle>
        <CardDescription>
          Going on leave or travelling? Hand your approvals and permissions to a
          teammate until a date. Everything they approve shows &ldquo;on behalf of
          you&rdquo; in the audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Active outgoing delegation */}
            {data?.mine && !data.mine.expired && (
              <div className="flex items-center justify-between rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5">
                <div className="text-sm">
                  <span className="font-medium">Delegated to {data.mine.delegateName}</span>
                  <span className="text-muted-foreground"> until {formatDate(data.mine.endsAt)}</span>
                  {data.mine.note && <div className="text-xs text-muted-foreground mt-0.5">{data.mine.note}</div>}
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => clear()}>
                  <XCircle className="size-4" /> End early
                </Button>
              </div>
            )}

            {/* Incoming delegations — people covering for me / me covering for them */}
            {data && data.incoming.length > 0 && (
              <div className="rounded-lg border border-info/40 bg-info/5 px-3 py-2.5 text-sm">
                <div className="flex items-center gap-1.5 font-medium mb-1">
                  <ShieldCheck className="size-4 text-info" /> You currently hold delegated authority from:
                </div>
                {data.incoming.map((d) => (
                  <div key={d.membershipId} className="text-muted-foreground text-xs">
                    {d.name} ({formatEnumLabel(d.role)}) — until {formatDate(d.endsAt)}{d.note ? ` · ${d.note}` : ""}
                  </div>
                ))}
              </div>
            )}

            {/* New delegation form */}
            {(!data?.mine || data.mine.expired) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label>Delegate to</Label>
                  <Select value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
                    <option value="">Choose a member…</option>
                    {(data?.members ?? []).map((m) => (
                      <option key={m.membershipId} value={m.membershipId}>
                        {m.name} — {m.designation ?? formatEnumLabel(m.role)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><CalendarDays className="size-3.5" /> Until</Label>
                  <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="On site at Pune project…" />
                </div>
                <Button onClick={save} disabled={busy || !delegateId || !endsAt}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Delegate
                </Button>
              </div>
            )}

            {/* Admin: all delegations in the company */}
            {data?.isAdmin && data.delegations.length > 0 && (
              <div>
                <div className="text-caption font-medium text-muted-foreground mb-1.5">All delegations in this company</div>
                <div className="space-y-1">
                  {data.delegations.map((d) => (
                    <div key={d.membershipId} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                      <span>
                        {d.name} <ArrowRight className="inline size-3 text-muted-foreground" /> {d.delegateName ?? "—"}
                        <span className="text-muted-foreground"> · until {formatDate(d.endsAt)}{d.expired ? " (expired)" : ""}</span>
                      </span>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => clear(d.membershipId)}>
                        Clear
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
