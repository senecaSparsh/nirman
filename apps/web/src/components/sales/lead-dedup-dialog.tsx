"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Loader2, GitMerge } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type DuplicateLead = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  priority: string;
  source: string;
  createdAt: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  assignedToName: string | null;
  activityCount: number;
};

type DuplicateGroup = {
  key: string;
  leads: DuplicateLead[];
};

/**
 * Dialog to find and merge duplicate leads (same name + phone).
 * Calls `GET /api/leads/dedup` to find duplicates, then
 * `POST /api/leads/dedup` to merge — keeping the selected lead
 * and soft-deleting the rest (activities are re-parented).
 */
export function LeadDedupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [keepIds, setKeepIds] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/leads/dedup");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setGroups(data.duplicates ?? []);
          // Default: keep the lead with the most activities in each group
          const defaults: Record<string, string> = {};
          for (const g of data.duplicates ?? []) {
            const best = g.leads.reduce((a: DuplicateLead, b: DuplicateLead) =>
              b.activityCount > a.activityCount ? b : a,
            );
            defaults[g.key] = best.id;
          }
          setKeepIds(defaults);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open]);

  async function mergeGroup(group: DuplicateGroup) {
    const keepId = keepIds[group.key];
    if (!keepId) return;
    const deleteIds = group.leads.filter((l) => l.id !== keepId).map((l) => l.id);
    if (deleteIds.length === 0) return;
    setMerging(group.key);
    try {
      const res = await fetch("/api/leads/dedup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, deleteIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to merge");
      toast.success(`Merged ${deleteIds.length} duplicate lead${deleteIds.length === 1 ? "" : "s"}`);
      // Remove this group from the list
      setGroups((prev) => prev.filter((g) => g.key !== group.key));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setMerging(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Duplicate leads"
      description="Leads with the same name and phone number. Select which one to keep, then merge — activities are moved to the kept lead."
      size="lg"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning for duplicates…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Check className="h-8 w-8 text-success mb-2" />
            <p className="text-body font-medium">No duplicates found</p>
            <p className="text-meta text-muted-foreground">All leads have unique name + phone combinations.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4 text-warning" />
                  <span className="text-body font-medium">{group.leads[0]!.name}</span>
                  <span className="font-mono text-meta text-muted-foreground">{group.leads[0]!.phone}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => mergeGroup(group)}
                  disabled={merging === group.key}
                >
                  {merging === group.key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <GitMerge className="mr-1 h-3.5 w-3.5" />}
                  Merge
                </Button>
              </div>
              <div className="space-y-1.5">
                {group.leads.map((lead) => (
                  <label
                    key={lead.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm transition-colors ${keepIds[group.key] === lead.id ? "border-success bg-success/5" : "border-border hover:bg-accent"}`}
                  >
                    <input
                      type="radio"
                      name={group.key}
                      checked={keepIds[group.key] === lead.id}
                      onChange={() => setKeepIds((prev) => ({ ...prev, [group.key]: lead.id }))}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 grid grid-cols-[1fr_80px_60px_60px] items-center gap-2 text-meta">
                      <div>
                        <Badge variant="default" className="mr-1 px-1 py-0">{lead.stage}</Badge>
                        {lead.assignedToName && <span className="text-muted-foreground"> · {lead.assignedToName}</span>}
                      </div>
                      <span className="text-muted-foreground">{formatDate(lead.createdAt)}</span>
                      <span className="tnum text-muted-foreground">{lead.activityCount} act</span>
                      <span className="text-muted-foreground">{lead.source}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}
