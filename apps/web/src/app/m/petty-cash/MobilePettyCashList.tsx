"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Coins, Wallet, Share2, Tag, Building2, User, IndianRupee, Hash, Calendar, ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

export type PettyCashFloatListItem = {
  id: string;
  name: string;
  projectName: string | null;
  custodianId: string | null;
  custodianName: string | null;
  floatAmount: number;
  topUpTotal: number;
  spentTotal: number;
  topUpCount: number;
  lastTopUpDate: string | null;
};

export function MobilePettyCashList({
  items,
  totalBalance,
  totalTopUps,
  canManage,
  canSpend,
  currentUserId,
}: {
  items: PettyCashFloatListItem[];
  totalBalance: number;
  totalTopUps: number;
  canManage?: boolean;
  canSpend?: boolean;
  currentUserId?: string | null;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.projectName?.toLowerCase().includes(q) ?? false) ||
        (f.custodianName?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const stats: SummaryStat[] = [
    { label: "Balance", value: formatCurrencyCompact(totalBalance) },
    { label: "Top-ups", value: formatCurrencyCompact(totalTopUps) },
    { label: "Floats", value: String(items.length) },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Coins}
        title="No petty cash floats"
        hint={canManage ? "Tap + to create your first float" : "Site cash floats will appear here once created."}
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search floats…"
      />
      <MobileSummaryStrip stats={stats} />
      <div className="flex flex-col gap-2.5 px-1">
        {filtered.map((f) => (
          <PettyCashCard key={f.id} f={f} canManage={canManage} canSpend={canSpend} currentUserId={currentUserId} />
        ))}
      </div>
      {filtered.length === 0 && <MobileNoResults query={query} />}
    </div>
  );
}

/* ─── Petty cash card — long-press opens overview sheet ─── */
function PettyCashCard({ f, canManage, canSpend, currentUserId }: { f: PettyCashFloatListItem; canManage?: boolean; canSpend?: boolean; currentUserId?: string | null }) {
  const router = useRouter();
  const utilization = f.topUpTotal > 0 ? (f.spentTotal / f.topUpTotal) * 100 : 0;

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  // ── Top-up / spend dialogs ──
  const [showTopUp, setShowTopUp] = useState(false);
  const [showSpend, setShowSpend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ amount: "", referenceNo: "", notes: "" });
  const [spendForm, setSpendForm] = useState({ amount: "", category: "", notes: "" });

  // floatAmount is the running balance (mutated on top-up/spend); it always
  // equals topUpTotal − spentTotal. Don't add topUpTotal again — that
  // double-counts inflows.
  const balanceAfter = f.floatAmount;

  async function submitTopUp() {
    const amount = Number(topUpForm.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/petty-cash/${f.id}/topups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, referenceNo: topUpForm.referenceNo || null, notes: topUpForm.notes || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Top-up failed");
      toast.success("Float topped up");
      setShowTopUp(false);
      setTopUpForm({ amount: "", referenceNo: "", notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSpend() {
    const amount = Number(spendForm.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (!spendForm.category.trim()) { toast.error("Category is required"); return; }
    if (amount > balanceAfter) { toast.error(`Insufficient balance — only ${formatCurrency(balanceAfter)} available`); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/petty-cash/${f.id}/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, category: spendForm.category.trim(), notes: spendForm.notes || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Spend failed");
      toast.success("Spend recorded");
      setShowSpend(false);
      setSpendForm({ amount: "", category: "", notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Spend failed");
    } finally {
      setBusy(false);
    }
  }

  const overviewRows: OverviewRow[] = [
    { icon: Tag, label: "Float Name", value: f.name },
    { icon: Calendar, label: "Last Top-up", value: f.lastTopUpDate ? formatDate(f.lastTopUpDate) : "—" },
    { icon: IndianRupee, label: "Current Balance", value: formatCurrency(balanceAfter), valueColor: "var(--color-go)" },
    { icon: IndianRupee, label: "Total In (float + top-ups)", value: formatCurrency(f.topUpTotal) },
    { icon: IndianRupee, label: "Spent Total", value: formatCurrency(f.spentTotal), valueColor: "var(--color-stop)" },
    { icon: Hash, label: "Top-up Count", value: String(f.topUpCount) },
    { icon: Building2, label: "Project", value: f.projectName ?? "—" },
    { icon: User, label: "Custodian", value: f.custodianName ?? "—" },
  ];

  // Spend is custodian-scoped: only the person holding the cash (or a finance
  // manager) records spends. Unassigned floats (no custodian) stay open to any
  // expense-creator — the API enforces the same rule.
  const isCustodian = f.custodianId == null || f.custodianId === currentUserId;
  const canRecordSpend = canSpend && (isCustodian || canManage);

  const overviewActions: ContextAction[] = [
    ...(canRecordSpend
      ? [{
          label: "Record Spend",
          icon: ArrowUpFromLine,
          onPress: () => { setOverviewOpen(false); setShowSpend(true); },
        }]
      : []),
    ...(canManage
      ? [{
          label: "Top Up",
          icon: ArrowDownToLine,
          onPress: () => { setOverviewOpen(false); setShowTopUp(true); },
        }]
      : []),
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/petty-cash`;
        if (navigator.share) {
          navigator.share({ title: f.name, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <>
      <div {...longPressBind}>
        <button
          type="button"
          onClick={() => { setPressPoint(null); setOverviewOpen(true); }}
          className="block w-full text-left rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors active:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-foreground">{f.name}</p>
              {f.projectName && (
                <p className="mt-0.5 truncate text-caption text-muted-foreground">{f.projectName}</p>
              )}
              {f.custodianName && (
                <p className="mt-0.5 truncate text-caption text-muted-foreground">
                  <Wallet className="mr-1 inline size-3" />
                  {f.custodianName}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="tnum text-body font-semibold text-foreground">{formatCurrencyCompact(balanceAfter)}</p>
              <p className="tnum text-caption text-muted-foreground">balance</p>
            </div>
          </div>
          {/* Utilization bar */}
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${utilization > 80 ? "bg-danger" : utilization > 50 ? "bg-warning" : "bg-brand"}`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-caption text-muted-foreground">
              {utilization.toFixed(0)}% utilized
            </span>
            {f.lastTopUpDate && (
              <span className="text-caption text-muted-foreground">
                Last top-up: {formatDate(f.lastTopUpDate)}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={f.name}
        subtitle={formatCurrency(f.floatAmount)}
        rows={overviewRows}
        actions={overviewActions}
      />

      {/* Record Spend dialog */}
      <MobileDialog open={showSpend} onClose={() => setShowSpend(false)} title={`Spend from ${f.name}`}>
        <div className="flex flex-col gap-3">
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Available balance: <span className="font-bold tnum" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(balanceAfter)}</span>
          </p>
          <div>
            <label className="block text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Amount <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={spendForm.amount}
              onChange={(e) => setSpendForm((s) => ({ ...s, amount: e.target.value }))}
              placeholder="0"
              className="w-full h-9 px-2 rounded-[0.375rem] border text-m-body outline-none tabular-nums"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Category <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input
              type="text"
              value={spendForm.category}
              onChange={(e) => setSpendForm((s) => ({ ...s, category: e.target.value }))}
              placeholder="e.g. Tea & snacks, Fuel, Stationery"
              className="w-full h-9 px-2 rounded-[0.375rem] border text-m-body outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
          <div>
            <label className="block text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Notes</label>
            <input
              type="text"
              value={spendForm.notes}
              onChange={(e) => setSpendForm((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Optional"
              className="w-full h-9 px-2 rounded-[0.375rem] border text-m-body outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowSpend(false)}
              disabled={busy}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={submitSpend}
              disabled={busy || !spendForm.amount || !spendForm.category.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
              Record Spend
            </button>
          </div>
        </div>
      </MobileDialog>

      {/* Top Up dialog */}
      <MobileDialog open={showTopUp} onClose={() => setShowTopUp(false)} title={`Top up ${f.name}`}>
        <div className="flex flex-col gap-3">
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Current balance: <span className="font-bold tnum" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(balanceAfter)}</span>
          </p>
          <div>
            <label className="block text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Amount <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={topUpForm.amount}
              onChange={(e) => setTopUpForm((s) => ({ ...s, amount: e.target.value }))}
              placeholder="0"
              className="w-full h-9 px-2 rounded-[0.375rem] border text-m-body outline-none tabular-nums"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Reference No</label>
            <input
              type="text"
              value={topUpForm.referenceNo}
              onChange={(e) => setTopUpForm((s) => ({ ...s, referenceNo: e.target.value }))}
              placeholder="Cheque / UPI / voucher no (optional)"
              className="w-full h-9 px-2 rounded-[0.375rem] border text-m-body outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
          <div>
            <label className="block text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Notes</label>
            <input
              type="text"
              value={topUpForm.notes}
              onChange={(e) => setTopUpForm((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Optional"
              className="w-full h-9 px-2 rounded-[0.375rem] border text-m-body outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowTopUp(false)}
              disabled={busy}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={submitTopUp}
              disabled={busy || !topUpForm.amount}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}
              Top Up
            </button>
          </div>
        </div>
      </MobileDialog>
    </>
  );
}
