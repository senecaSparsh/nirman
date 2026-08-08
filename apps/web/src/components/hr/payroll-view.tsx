"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Plus, Eye, CheckCircle, DollarSign, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";

type PayrollStatus = "DRAFT" | "PROCESSED" | "PAID";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type PayrollRow = {
  id: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  status: PayrollStatus;
  totalGross: number;
  totalOvertime: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  processedByName: string | null;
  processedAt: string | null;
  paidAt: string | null;
};

export function PayrollView({
  periods,
  permissions,
}: {
  periods: PayrollRow[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? true;
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PayrollRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleAction = async (period: PayrollRow, action: "process" | "pay") => {
    try {
      const res = await fetch(`/api/payroll/${period.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(action === "process" ? "Payroll processed — posted to GL" : "Payroll settled — salaries paid");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed");
      }
    } catch {
      toast.error("Network error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {periods.length} payroll period{periods.length !== 1 ? "s" : ""}
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Generate Payroll
          </Button>
        )}
      </div>

      {/* Periods list */}
      {periods.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="No payroll periods"
          description="Generate a payroll period from attendance data to get started."
          action={canManage ? (
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Generate Payroll
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card">
              {/* Period header row */}
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
              >
                {expanded === p.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium">{MONTHS[p.month]} {p.year}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    {p.employeeCount} employees · {formatDate(p.startDate)} → {formatDate(p.endDate)}
                    {p.processedByName && ` · processed by ${p.processedByName}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-body font-bold">{formatCurrency(p.totalNet)}</div>
                  <div className="text-micro text-muted-foreground">net pay</div>
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === p.id && (
                <div className="border-t border-border p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="text-micro text-muted-foreground">Gross</div>
                      <div className="tnum text-body font-semibold">{formatCurrency(p.totalGross)}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="text-micro text-muted-foreground">Overtime</div>
                      <div className="tnum text-body font-semibold">{formatCurrency(p.totalOvertime)}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="text-micro text-muted-foreground">Deductions</div>
                      <div className="tnum text-body font-semibold">{formatCurrency(p.totalDeductions)}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="text-micro text-muted-foreground">Net Pay</div>
                      <div className="tnum text-body font-bold">{formatCurrency(p.totalNet)}</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetailTarget(p)}>
                        <Eye className="mr-1 h-3.5 w-3.5" /> View Lines
                      </Button>
                      {p.status === "DRAFT" && (
                        <Button size="sm" onClick={() => handleAction(p, "process")}>
                          <CheckCircle className="mr-1 h-3.5 w-3.5" /> Process &amp; Post to GL
                        </Button>
                      )}
                      {p.status === "PROCESSED" && (
                        <Button size="sm" onClick={() => handleAction(p, "pay")}>
                          <DollarSign className="mr-1 h-3.5 w-3.5" /> Mark as Paid
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generate dialog */}
      {generateOpen && (
        <GeneratePayrollDialog
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => { setGenerateOpen(false); router.refresh(); }}
        />
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <PayrollDetailDialog
          period={detailTarget}
          canEdit={canManage && detailTarget.status === "DRAFT"}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function GeneratePayrollDialog({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: () => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      if (res.ok) {
        toast.success(`Payroll generated for ${MONTHS[month]} ${year}`);
        onGenerated();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to generate payroll");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Generate Payroll" className="max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-meta text-muted-foreground">
            Computes salary lines from attendance data for the selected month. Creates a DRAFT period you can review before processing.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Month</Label>
              <Select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => i > 0 && <option key={i} value={i}>{m}</option>)}
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} min="2000" max="2100" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Generating…" : "Generate"}</Button>
          </div>
        </form>
    </Dialog>
  );
}

function PayrollDetailDialog({
  period,
  canEdit,
  onClose,
  onUpdated,
}: {
  period: PayrollRow;
  canEdit: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [lines, setLines] = useState<Array<{
    id: string;
    employeeName: string;
    trade: string | null;
    wageType: string;
    daysWorked: number;
    basicAmount: number;
    overtimeAmount: number;
    allowance: number;
    bonus: number;
    pf: number;
    tax: number;
    deductions: number;
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/payroll/${period.id}`)
      .then((r) => r.json())
      .then((data) => {
        setLines(data.lines ?? []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); toast.error("Failed to load payroll details"); });
  }, [period.id]);

  const handleSaveLine = async (lineId: string) => {
    const v = editValues;
    const body: Record<string, number> = {};
    if (v.overtimeAmount !== undefined) body.overtimeAmount = parseFloat(v.overtimeAmount) || 0;
    if (v.allowance !== undefined) body.allowance = parseFloat(v.allowance) || 0;
    if (v.bonus !== undefined) body.bonus = parseFloat(v.bonus) || 0;
    if (v.pf !== undefined) body.pf = parseFloat(v.pf) || 0;
    if (v.tax !== undefined) body.tax = parseFloat(v.tax) || 0;
    if (v.deductions !== undefined) body.deductions = parseFloat(v.deductions) || 0;

    const res = await fetch(`/api/payroll/${period.id}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("Payroll line updated");
      setEditingLine(null);
      setEditValues({});
      // Refresh lines
      try {
        const refreshRes = await fetch(`/api/payroll/${period.id}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setLines(data.lines ?? []);
        }
      } catch { /* refresh is best-effort */ }
      onUpdated();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update");
    }
  };

  function startEdit(l: { id: string; overtimeAmount: number; allowance: number; bonus: number; pf: number; tax: number; deductions: number }) {
    setEditingLine(l.id);
    setEditValues({
      overtimeAmount: l.overtimeAmount.toString(),
      allowance: l.allowance.toString(),
      bonus: l.bonus.toString(),
      pf: l.pf.toString(),
      tax: l.tax.toString(),
      deductions: l.deductions.toString(),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${MONTHS[period.month]} ${period.year} — Payroll Lines`} className="max-w-3xl">
        {loading ? (
          <div className="py-8 text-center text-meta text-muted-foreground">Loading…</div>
        ) : lines && lines.length > 0 ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Days</TH>
                <TH>Basic</TH>
                <TH>OT</TH>
                <TH>Allow.</TH>
                <TH>Bonus</TH>
                <TH>PF</TH>
                <TH>Tax</TH>
                <TH>Deduct.</TH>
                <TH>Net Pay</TH>
                {canEdit && <TH></TH>}
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <div className="font-medium">{l.employeeName}</div>
                    <div className="text-caption text-muted-foreground">{l.trade ?? l.wageType}</div>
                  </TD>
                  <TD className="tnum">{l.daysWorked}</TD>
                  <TD className="tnum">{formatCurrency(l.basicAmount)}</TD>
                  {editingLine === l.id ? (
                    <>
                      <TD className="tnum">
                        <Input type="number" value={editValues.overtimeAmount ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, overtimeAmount: e.target.value }))} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      </TD>
                      <TD className="tnum">
                        <Input type="number" value={editValues.allowance ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, allowance: e.target.value }))} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      </TD>
                      <TD className="tnum">
                        <Input type="number" value={editValues.bonus ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, bonus: e.target.value }))} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      </TD>
                      <TD className="tnum">
                        <Input type="number" value={editValues.pf ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, pf: e.target.value }))} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      </TD>
                      <TD className="tnum">
                        <Input type="number" value={editValues.tax ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, tax: e.target.value }))} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      </TD>
                      <TD className="tnum">
                        <Input type="number" value={editValues.deductions ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, deductions: e.target.value }))} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      </TD>
                      <TD className="tnum font-bold">{formatCurrency(l.netPay)}</TD>
                      <TD>
                        <div className="flex gap-1">
                          <button onClick={() => handleSaveLine(l.id)} className="rounded p-0.5 text-success hover:bg-success/10" title="Save">
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { setEditingLine(null); setEditValues({}); }} className="rounded p-0.5 text-muted-foreground hover:bg-accent" title="Cancel">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TD>
                    </>
                  ) : (
                    <>
                      <TD className="tnum">{formatCurrency(l.overtimeAmount)}</TD>
                      <TD className="tnum">{formatCurrency(l.allowance)}</TD>
                      <TD className="tnum">{formatCurrency(l.bonus)}</TD>
                      <TD className="tnum">{formatCurrency(l.pf)}</TD>
                      <TD className="tnum">{formatCurrency(l.tax)}</TD>
                      <TD className="tnum">{formatCurrency(l.deductions)}</TD>
                      <TD className="tnum font-bold">{formatCurrency(l.netPay)}</TD>
                      {canEdit && (
                        <TD>
                          <button onClick={() => startEdit(l)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit line">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </TD>
                      )}
                    </>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No lines" description="This payroll has no employee lines." />
        )}
    </Dialog>
  );
}
