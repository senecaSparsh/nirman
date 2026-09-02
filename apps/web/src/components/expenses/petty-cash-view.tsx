"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw, Loader2, Wallet, ChevronDown, ChevronRight, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ProjectOption, ExpenseCategoryRow } from "@/lib/types";

type FloatRow = {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  floatAmount: number;
  topUpTotal: number;
  spentTotal: number;
  custodianId: string | null;
  custodianName: string | null;
  topUps: {
    id: string;
    amount: number;
    paymentMode: string | null;
    referenceNo: string | null;
    notes: string | null;
    date: string;
    createdByName: string | null;
  }[];
};

export function PettyCashView({
  floats,
  projects,
  employees,
  categories,
  permissions,
}: {
  floats: FloatRow[];
  projects: ProjectOption[];
  employees: { id: string; name: string }[];
  categories: ExpenseCategoryRow[];
  permissions: { canManage: boolean };
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [topUpFor, setTopUpFor] = useState<FloatRow | null>(null);
  const [spendFor, setSpendFor] = useState<FloatRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", projectId: "", floatAmount: "", custodianId: "" });
  const [topUpForm, setTopUpForm] = useState({ amount: "", paymentMode: "NEFT", referenceNo: "", notes: "" });
  const [spendForm, setSpendForm] = useState({ category: "", categoryId: "", amount: "", notes: "" });

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createFloat() {
    if (!createForm.name.trim() || !createForm.floatAmount) {
      toast.error("Name and float amount are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          projectId: createForm.projectId || null,
          floatAmount: Number(createForm.floatAmount),
          custodianId: createForm.custodianId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create float");
      toast.success("Petty cash float created");
      setCreateOpen(false);
      setCreateForm({ name: "", projectId: "", floatAmount: "", custodianId: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function doTopUp() {
    if (!topUpFor || !topUpForm.amount) {
      toast.error("Amount is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/petty-cash/${topUpFor.id}/topups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(topUpForm.amount),
          paymentMode: topUpForm.paymentMode,
          referenceNo: topUpForm.referenceNo || null,
          notes: topUpForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to top up");
      toast.success("Float topped up");
      setTopUpFor(null);
      setTopUpForm({ amount: "", paymentMode: "NEFT", referenceNo: "", notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setSaving(false);
    }
  }

  async function doSpend() {
    if (!spendFor || !spendForm.amount || !spendForm.category.trim()) {
      toast.error("Category and amount are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/petty-cash/${spendFor.id}/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(spendForm.amount),
          category: spendForm.category.trim(),
          categoryId: spendForm.categoryId || null,
          notes: spendForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record spend");
      toast.success("Spend recorded — expense booked");
      setSpendFor(null);
      setSpendForm({ category: "", categoryId: "", amount: "", notes: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Spend failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {permissions.canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Float
          </Button>
        )}
      </div>

      {floats.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="No petty cash floats"
          description="Create a cash float for a site or office to track top-ups and spend."
        />
      ) : (
        <div className="space-y-2">
          {floats.map((f) => {
            const isOpen = expanded.has(f.id);
            const lowBalance = f.floatAmount < f.topUpTotal * 0.2;
            return (
              <div key={f.id} className="rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(f.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div className="min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{f.name}</span>
                        {f.projectName && <Badge variant="outline">{f.projectName}</Badge>}
                        {lowBalance && <Badge variant="warning">Low</Badge>}
                      </div>
                      <div className="text-caption text-muted-foreground">
                        {f.custodianName ? `Custodian: ${f.custodianName}` : "No custodian"}
                        {` · ${f.topUps.length} top-up${f.topUps.length === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum font-semibold text-foreground">{formatCurrency(f.floatAmount)}</div>
                      <div className="text-caption text-muted-foreground">balance</div>
                    </div>
                    {permissions.canManage && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setSpendFor(f); setSpendForm({ category: "", categoryId: "", amount: "", notes: "" }); }}
                        >
                          <Receipt className="h-3.5 w-3.5" /> Spend
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setTopUpFor(f); setTopUpForm({ amount: "", paymentMode: "NEFT", referenceNo: "", notes: "" }); }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Top Up
                        </Button>
                      </div>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-muted/10 p-4">
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <div className="text-caption text-muted-foreground">Total Top-ups</div>
                        <div className="tnum font-medium text-foreground">{formatCurrency(f.topUpTotal)}</div>
                      </div>
                      <div>
                        <div className="text-caption text-muted-foreground">Total Spent</div>
                        <div className="tnum font-medium text-danger">{formatCurrency(f.spentTotal)}</div>
                      </div>
                      <div>
                        <div className="text-caption text-muted-foreground">Current Balance</div>
                        <div className="tnum font-medium text-foreground">{formatCurrency(f.floatAmount)}</div>
                      </div>
                    </div>
                    {f.topUps.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-caption font-medium text-muted-foreground mb-1">Recent Top-ups</div>
                        {f.topUps.map((t) => (
                          <div key={t.id} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-1.5">
                            <div className="min-w-0">
                              <span className="tnum font-medium text-foreground">{formatCurrency(t.amount)}</span>
                              {t.paymentMode && <Badge variant="outline" className="ml-2">{t.paymentMode}</Badge>}
                              {t.referenceNo && <span className="ml-2 text-caption text-muted-foreground">{t.referenceNo}</span>}
                              {t.notes && <span className="ml-2 text-caption text-muted-foreground italic truncate">{t.notes}</span>}
                            </div>
                            <div className="text-caption text-muted-foreground">
                              {formatDate(t.date)}{t.createdByName ? ` · ${t.createdByName}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-caption text-muted-foreground">No top-ups recorded yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create float dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Petty Cash Float"
        description="Create a cash float for a site or office."
        className="max-w-md"
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pc-name">Float Name *</Label>
            <Input id="pc-name" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Site Office Cash" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc-amount">Initial Float *</Label>
              <Input id="pc-amount" type="number" min="0" step="0.01" value={createForm.floatAmount} onChange={(e) => setCreateForm((f) => ({ ...f, floatAmount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-custodian">Custodian</Label>
              <Select id="pc-custodian" value={createForm.custodianId} onChange={(e) => setCreateForm((f) => ({ ...f, custodianId: e.target.value }))}>
                <option value="">— None —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-project">Project (optional)</Label>
            <Select id="pc-project" value={createForm.projectId} onChange={(e) => setCreateForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createFloat} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create Float
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Top-up dialog */}
      {topUpFor && (
        <Dialog
          open={topUpFor !== null}
          onOpenChange={(o) => !o && setTopUpFor(null)}
          title={`Top Up — ${topUpFor.name}`}
          description={`Current balance: ${formatCurrency(topUpFor.floatAmount)}`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tu-amount">Amount *</Label>
              <Input id="tu-amount" type="number" min="0" step="0.01" value={topUpForm.amount} onChange={(e) => setTopUpForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tu-mode">Payment Mode</Label>
                <Select id="tu-mode" value={topUpForm.paymentMode} onChange={(e) => setTopUpForm((f) => ({ ...f, paymentMode: e.target.value }))}>
                  {["NEFT", "UPI", "BANK", "CASH"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tu-ref">Reference No.</Label>
                <Input id="tu-ref" value={topUpForm.referenceNo} onChange={(e) => setTopUpForm((f) => ({ ...f, referenceNo: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tu-notes">Notes</Label>
              <Textarea id="tu-notes" value={topUpForm.notes} onChange={(e) => setTopUpForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTopUpFor(null)}>Cancel</Button>
              <Button onClick={doTopUp} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Top Up
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Spend dialog */}
      {spendFor && (
        <Dialog
          open={spendFor !== null}
          onOpenChange={(o) => !o && setSpendFor(null)}
          title={`Record Spend — ${spendFor.name}`}
          description={`Balance: ${formatCurrency(spendFor.floatAmount)} · Creates an approved expense + GL entry`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-cat">Category *</Label>
              {categories.length > 0 ? (
                <Select
                  id="sp-cat"
                  value={spendForm.categoryId}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value);
                    setSpendForm((f) => ({ ...f, categoryId: e.target.value, category: cat?.name ?? f.category }));
                  }}
                >
                  <option value="">— Select —</option>
                  {categories.filter((c) => c.isActive).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="sp-cat"
                  value={spendForm.category}
                  onChange={(e) => setSpendForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Tea/Coffee"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-amt">Amount *</Label>
              <Input
                id="sp-amt"
                type="number"
                min="0"
                step="0.01"
                max={spendFor.floatAmount}
                value={spendForm.amount}
                onChange={(e) => setSpendForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <div className="text-caption text-muted-foreground">Max: {formatCurrency(spendFor.floatAmount)}</div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-notes">Notes</Label>
              <Textarea id="sp-notes" value={spendForm.notes} onChange={(e) => setSpendForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSpendFor(null)}>Cancel</Button>
              <Button onClick={doSpend} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                Record Spend
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
