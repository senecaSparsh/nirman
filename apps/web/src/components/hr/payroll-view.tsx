"use client";

import { useState, useEffect, Fragment } from "react";
import { useFetch } from "@/lib/use-fetch";
import { useRouter } from "next/navigation";
import { Wallet, Plus, Eye, CheckCircle, DollarSign, Pencil, X, TrendingUp, Users, SearchX, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { MoneyCell } from "@/components/ui/cells";
import { EmployeeName } from "@/components/employee-name";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { GlPreviewPanel } from "@/components/finance/gl-preview-panel";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { GlPreviewLine } from "@nirman/services/gl-preview";

type PayrollStatus = "DRAFT" | "PROCESSED" | "PAID";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STATUS_CONFIG: Record<PayrollStatus, { label: string; class: string; dotClass: string; step: number }> = {
  DRAFT: { label: "Draft", class: "bg-warning/10 text-warning", dotClass: "bg-warning", step: 1 },
  PROCESSED: { label: "Processed", class: "bg-info/10 text-info", dotClass: "bg-info", step: 2 },
  PAID: { label: "Paid", class: "bg-success/10 text-success", dotClass: "bg-success", step: 3 },
};

type LineComponent = {
  id: string;
  type: string;
  label: string;
  calculationType: string;
  unitType: string | null;
  unitLabel: string | null;
  rate: number;
  quantity: number | null;
  amount: number;
  bucket: string;
  isDeduction: boolean;
  notes: string | null;
};

type PayrollLine = {
  id: string;
  employeeId: string;
  employeeName: string;
  trade: string | null;
  wageType: string;
  daysWorked: number;
  basicAmount: number;
  overtimeAmount: number;
  allowance: number;
  bonus: number;
  pf: number;
  employerPf: number;
  esi: number;
  professionTax: number;
  tax: number;
  deductions: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  components?: LineComponent[];
};

/** Short unit label for display: "₹3/km", "₹150/day", "₹500/trip". */
function unitSuffix(unitType: string | null, unitLabel: string | null): string {
  switch (unitType) {
    case "DAY": return "/day";
    case "KM": return "/km";
    case "TRIP": return "/trip";
    case "HOUR": return "/hr";
    case "MONTH": return "/mo";
    case "CUSTOM": return unitLabel ? `/${unitLabel}` : "";
    default: return "";
  }
}

/** Human-readable rate description for a component row. */
function rateDescription(c: Pick<LineComponent, "calculationType" | "unitType" | "unitLabel" | "rate">): string {
  if (c.calculationType === "UNIT_RATE") return `${formatCurrency(c.rate)}${unitSuffix(c.unitType, c.unitLabel)}`;
  if (c.calculationType === "PERCENTAGE_OF_BASIC") return `${c.rate}% of basic`;
  return "fixed";
}

/** Options for ad-hoc component adds — mirrors the salary structure types. */
const LINE_COMPONENT_OPTIONS = [
  { value: "HRA", label: "HRA" },
  { value: "DA", label: "DA" },
  { value: "TA", label: "Travel Allowance" },
  { value: "SPECIAL_ALLOWANCE", label: "Special Allowance" },
  { value: "FOOD_ALLOWANCE", label: "Food Allowance" },
  { value: "MEDICAL_ALLOWANCE", label: "Medical Allowance" },
  { value: "UNIFORM_ALLOWANCE", label: "Uniform Allowance" },
  { value: "WASHING_ALLOWANCE", label: "Washing Allowance" },
  { value: "LTA", label: "LTA" },
  { value: "PERFORMANCE_BONUS", label: "Performance Bonus" },
  { value: "JOINING_BONUS", label: "Joining Bonus" },
  { value: "RETENTION_BONUS", label: "Retention Bonus" },
  { value: "EMPLOYER_PF", label: "Employer PF" },
  { value: "EMPLOYEE_PF", label: "Employee PF" },
  { value: "EMPLOYER_ESI", label: "Employer ESI" },
  { value: "EMPLOYEE_ESI", label: "Employee ESI" },
  { value: "GRATUITY", label: "Gratuity" },
  { value: "PROFESSION_TAX", label: "Profession Tax" },
  { value: "TDS", label: "TDS" },
  { value: "OTHER", label: "Other / Ad-hoc" },
];

const LINE_COMPONENT_LABELS: Record<string, string> = Object.fromEntries(
  LINE_COMPONENT_OPTIONS.map((o) => [o.value, o.label]),
);

/** Client-side mirror of the server's bucketForComponent — used only for
 *  live previews while editing; the server recomputes authoritatively. */
function previewBucket(type: string, isDeduction: boolean): string {
  switch (type) {
    case "EMPLOYEE_PF": return "PF";
    case "EMPLOYER_PF": return "EMPLOYER_PF";
    case "EMPLOYEE_ESI": return "ESI";
    case "PROFESSION_TAX": return "PROFESSION_TAX";
    case "TDS": return "TAX";
    case "EMPLOYER_ESI":
    case "GRATUITY": return "EMPLOYER_ONLY";
    case "PERFORMANCE_BONUS":
    case "JOINING_BONUS":
    case "RETENTION_BONUS": return "BONUS";
    default: return isDeduction ? "DEDUCTIONS" : "ALLOWANCE";
  }
}

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

/** Payroll summary stats bar. */
function PayrollStatsBar({ periods }: { periods: PayrollRow[] }) {
  const total = periods.length;
  const drafts = periods.filter((p) => p.status === "DRAFT").length;
  const processed = periods.filter((p) => p.status === "PROCESSED").length;
  const paid = periods.filter((p) => p.status === "PAID").length;
  const totalNetPaid = periods.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.totalNet, 0);
  const avgNet = total > 0 ? periods.reduce((sum, p) => sum + p.totalNet, 0) / total : 0;

  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x divide-y sm:divide-y-0">
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Total Periods</span>
        <span className="text-figure text-foreground">{total}</span>
        <span className="text-micro text-muted-foreground">{drafts} draft · {processed} processed · {paid} paid</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Avg Net / Period</span>
        <span className="text-figure text-foreground">{formatCurrency(avgNet)}</span>
        <span className="text-micro text-muted-foreground">across all periods</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Total Paid Out</span>
        <span className="text-figure text-success">{formatCurrency(totalNetPaid)}</span>
        <span className="text-micro text-muted-foreground">{paid} settled periods</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Pending Action</span>
        <span className={cn("text-figure", drafts + processed > 0 ? "text-warning" : "text-success")}>
          {drafts + processed}
        </span>
        <span className="text-micro text-muted-foreground">{drafts} to process · {processed} to pay</span>
      </div>
    </div>
  );
}

/** Net pay trend sparkline. */
function PayrollTrend({ periods }: { periods: PayrollRow[] }) {
  const recent = [...periods].slice(0, 6).reverse();
  if (recent.length < 2) return null;
  const max = Math.max(...recent.map((p) => p.totalNet), 1);
  const min = Math.min(...recent.map((p) => p.totalNet), 0);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const points = recent.map((p, i) => {
    const x = (i / (recent.length - 1)) * width;
    const y = height - ((p.totalNet - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-32" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="text-caption text-muted-foreground">
        <span className="tnum font-medium text-foreground">{formatCurrency(recent[recent.length - 1]?.totalNet ?? 0)}</span>
        <span className="ml-1">latest net</span>
      </div>
    </div>
  );
}

/** Progress steps for payroll status. */
function PayrollProgressSteps({ status }: { status: PayrollStatus }) {
  const currentStep = (STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT).step;
  const steps: { label: string; step: number }[] = [
    { label: "Draft", step: 1 },
    { label: "Processed", step: 2 },
    { label: "Paid", step: 3 },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.step} className="flex items-center gap-1">
          <div className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full text-micro font-bold",
            s.step <= currentStep
              ? s.step === 1 ? "bg-warning text-warning-foreground"
                : s.step === 2 ? "bg-info text-info-foreground"
                : "bg-success text-success-foreground"
              : "bg-muted text-muted-foreground",
          )}>
            {s.step < currentStep ? "✓" : s.step}
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-0.5 w-4", s.step < currentStep ? "bg-success" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

export function PayrollView({
  periods,
  permissions,
}: {
  periods: PayrollRow[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PayrollRow | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<PayrollRow | null>(null);

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

  const payrollColumns: Column<PayrollRow>[] = [
    {
      key: "period",
      label: "Period",
      sortable: true,
      sortValue: (p) => `${p.year}-${String(p.month).padStart(2, "0")}`,
      render: (p) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-md bg-muted/40">
            <span className="text-micro font-medium text-muted-foreground">{(MONTHS[p.month] ?? "").slice(0, 3).toUpperCase()}</span>
            <span className="text-caption font-bold text-foreground tnum">{p.year}</span>
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground">{MONTHS[p.month]} {p.year}</div>
            <div className="text-caption text-muted-foreground">{formatDate(p.startDate)} → {formatDate(p.endDate)}</div>
          </div>
        </div>
      ),
      exportValue: (p) => `${MONTHS[p.month]} ${p.year}`,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      sortValue: (p) => p.status,
      render: (p) => {
        const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.DRAFT;
        return (
          <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-caption font-medium", cfg.class)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
            {cfg.label}
          </span>
        );
      },
      filterValue: (p) => STATUS_CONFIG[p.status]?.label ?? p.status,
      exportValue: (p) => p.status,
    },
    {
      key: "employeeCount",
      label: "Employees",
      align: "right",
      sortable: true,
      render: (p) => (
        <span className="inline-flex items-center gap-1 tnum text-body">
          <Users className="h-3 w-3 text-muted-foreground" />
          {p.employeeCount}
        </span>
      ),
      exportValue: (p) => p.employeeCount,
    },
    {
      key: "totalGross",
      label: "Gross",
      align: "right",
      sortable: true,
      render: (p) => <MoneyCell value={p.totalGross} formatted={formatCurrency(p.totalGross)} neutral />,
      exportValue: (p) => p.totalGross,
    },
    {
      key: "totalDeductions",
      label: "Deductions",
      align: "right",
      sortable: true,
      render: (p) => <span className="block font-semibold tnum text-danger">{formatCurrency(p.totalDeductions)}</span>,
      exportValue: (p) => p.totalDeductions,
    },
    {
      key: "totalNet",
      label: "Net Pay",
      align: "right",
      sortable: true,
      render: (p) => <span className="block font-bold tnum text-success">{formatCurrency(p.totalNet)}</span>,
      exportValue: (p) => p.totalNet,
    },
  ];

  function payrollRowActions(p: PayrollRow) {
    if (!canManage) {
      return (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDetailTarget(p); }}>
          <Eye className="mr-1 h-3.5 w-3.5" /> View Lines
        </Button>
      );
    }
    return (
      <>
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDetailTarget(p); }}>
          <Eye className="mr-1 h-3.5 w-3.5" /> View Lines
        </Button>
        {p.status === "DRAFT" && (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAction(p, "process"); }}>
            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Process
          </Button>
        )}
        {p.status === "PROCESSED" && (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAction(p, "pay"); }}>
            <DollarSign className="mr-1 h-3.5 w-3.5" /> Mark Paid
          </Button>
        )}
      </>
    );
  }

  const trailingButtons = canManage ? (
    <Button onClick={() => setGenerateOpen(true)}>
      <Plus className="h-4 w-4" /> Generate payroll
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No payroll periods match"
      description="Adjust the search or column filters to see all periods."
    />
  );

  return (
    <div className="space-y-4">
      {/* Summary stats bar */}
      <PayrollStatsBar periods={periods} />

      {/* Trend */}
      {periods.length >= 2 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-label text-muted-foreground/75">NET PAY TREND</span>
          </div>
          <PayrollTrend periods={periods} />
        </div>
      )}

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
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={periods}
            columns={payrollColumns}
            storageKey="payroll"
            hideable
            exportFileName="payroll"
            initialSort={{ key: "period", direction: "desc" }}
            onRowClick={(p) => setSummaryTarget(p)}
            searchable
            searchPlaceholder="Search period, status…"
            toolbarTrailing={trailingButtons}
            rowActions={payrollRowActions}
            rowTone={(p) => {
              if (p.status === "DRAFT") return "warning";
              return null;
            }}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Summary dialog (row click) */}
      {summaryTarget && (
        <PayrollSummaryDialog
          period={summaryTarget}
          canManage={canManage}
          onClose={() => setSummaryTarget(null)}
          onViewLines={() => { setDetailTarget(summaryTarget); setSummaryTarget(null); }}
          onAction={handleAction}
        />
      )}

      {/* Generate dialog */}
      {generateOpen && (
        <GeneratePayrollDialog
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => { setGenerateOpen(false); router.refresh(); }}
        />
      )}

      {/* Detail dialog (View Lines) */}
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

// ───────────────────────────────────────────────────────────
//  Payroll Summary Dialog (row click)
// ───────────────────────────────────────────────────────────

function PayrollSummaryDialog({
  period,
  canManage,
  onClose,
  onViewLines,
  onAction,
}: {
  period: PayrollRow;
  canManage: boolean;
  onClose: () => void;
  onViewLines: () => void;
  onAction: (period: PayrollRow, action: "process" | "pay") => void;
}) {
  const cfg = STATUS_CONFIG[period.status] ?? STATUS_CONFIG.DRAFT;
  const deductionRate = period.totalGross > 0 ? (period.totalDeductions / period.totalGross) * 100 : 0;
  const [previewLines, setPreviewLines] = useState<GlPreviewLine[]>([]);
  const [previewing, setPreviewing] = useState(false);

  async function previewPayrollGl() {
    setPreviewing(true);
    try {
      // Fetch payroll lines to compute deduction breakdown
      const linesRes = await fetch(`/api/payroll/${period.id}`);
      const linesData = await linesRes.json();
      const lines: Array<{
        pf: number; employerPf: number; esi: number;
        professionTax: number; tax: number; deductions: number;
      }> = linesData.lines ?? [];

      const totalPF = lines.reduce((s, l) => s + l.pf, 0);
      const totalEmployerPf = lines.reduce((s, l) => s + l.employerPf, 0);
      const totalESI = lines.reduce((s, l) => s + l.esi, 0);
      const totalProfessionTax = lines.reduce((s, l) => s + l.professionTax, 0);
      const totalTDS = lines.reduce((s, l) => s + l.tax, 0);

      const res = await fetch("/api/gl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payroll",
          totalGross: period.totalGross,
          totalNet: period.totalNet,
          totalPF,
          totalEmployerPf,
          totalESI,
          totalProfessionTax,
          totalTDS,
          totalDeductions: period.totalDeductions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to preview");
      setPreviewLines(data.lines);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${MONTHS[period.month]} ${period.year}`}
      description={`${formatDate(period.startDate)} → ${formatDate(period.endDate)} · ${period.employeeCount} employees`}
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Status + progress */}
        <div className="flex items-center justify-between">
          <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-caption font-medium", cfg.class)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
            {cfg.label}
          </span>
          <PayrollProgressSteps status={period.status} />
        </div>

        {/* Financial breakdown */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-micro text-muted-foreground">Gross Pay</div>
            <div className="tnum text-body font-semibold text-foreground">{formatCurrency(period.totalGross)}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-micro text-muted-foreground">Overtime</div>
            <div className="tnum text-body font-semibold text-info">{formatCurrency(period.totalOvertime)}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-micro text-muted-foreground">Deductions</div>
            <div className="tnum text-body font-semibold text-danger">{formatCurrency(period.totalDeductions)}</div>
            <div className="text-micro text-muted-foreground">{deductionRate.toFixed(1)}% of gross</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-micro text-muted-foreground">Net Pay</div>
            <div className="tnum text-body font-bold text-success">{formatCurrency(period.totalNet)}</div>
          </div>
        </div>

        {/* Visual breakdown bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-micro text-muted-foreground">
            <span>Composition</span>
            <span>{((period.totalNet / (period.totalGross || 1)) * 100).toFixed(0)}% net ratio</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: `${(period.totalNet / (period.totalGross || 1)) * 100}%` }} title={`Net: ${formatCurrency(period.totalNet)}`} />
            <div className="bg-danger/60" style={{ width: `${(period.totalDeductions / (period.totalGross || 1)) * 100}%` }} title={`Deductions: ${formatCurrency(period.totalDeductions)}`} />
          </div>
        </div>

        {/* Processed by */}
        {period.processedByName && (
          <div className="text-caption text-muted-foreground">
            Processed by {period.processedByName}{period.processedAt ? ` on ${formatDate(period.processedAt)}` : ""}
          </div>
        )}

        {/* GL Impact Preview — collapsible inline panel before actions */}
        {canManage && period.status === "DRAFT" && previewLines.length > 0 && (
          <GlPreviewPanel
            lines={previewLines}
            title="GL Impact — Payroll"
            description="These journal entries will be posted when you process this payroll period."
            defaultOpen
          />
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={onViewLines}>
            <Eye className="mr-1 h-3.5 w-3.5" /> View Lines
          </Button>
          {canManage && period.status === "DRAFT" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={previewPayrollGl}
              disabled={previewing}
            >
              {previewing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookOpen className="mr-1 h-3.5 w-3.5" />
              )}
              Preview GL
            </Button>
          )}
          {canManage && period.status === "DRAFT" && (
            <Button size="sm" onClick={() => onAction(period, "process")}>
              <CheckCircle className="mr-1 h-3.5 w-3.5" /> Process &amp; Post to GL
            </Button>
          )}
          {canManage && period.status === "PROCESSED" && (
            <Button size="sm" onClick={() => onAction(period, "pay")}>
              <DollarSign className="mr-1 h-3.5 w-3.5" /> Mark as Paid
            </Button>
          )}
        </div>
      </div>
    </Dialog>
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-border bg-subtle/50 p-3">
          <p className="text-meta text-muted-foreground">
            Computes salary lines from attendance data for the selected month. Creates a DRAFT period you can review before processing.
          </p>
        </div>
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
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
  const [lines, setLines] = useState<PayrollLine[] | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editOvertime, setEditOvertime] = useState("");
  const [editComponents, setEditComponents] = useState<LineComponent[]>([]);
  const [saving, setSaving] = useState(false);
  // Add-component form state
  const [addType, setAddType] = useState("OTHER");
  const [addLabel, setAddLabel] = useState("");
  const [addCalc, setAddCalc] = useState<"FIXED" | "PERCENTAGE_OF_BASIC" | "UNIT_RATE">("FIXED");
  const [addRate, setAddRate] = useState("");
  const [addUnit, setAddUnit] = useState("DAY");
  const [addQty, setAddQty] = useState("");
  const [addIsDeduction, setAddIsDeduction] = useState(false);

  const { data: periodData, loading, error: linesError } = useFetch<{ lines?: PayrollLine[] }>(
    `/api/payroll/${period.id}`,
  );
  // Local copy so a saved line can be merged back without a full refetch.
  useEffect(() => {
    if (periodData?.lines) setLines(periodData.lines);
  }, [periodData]);
  useEffect(() => {
    if (linesError) toast.error("Failed to load payroll details");
  }, [linesError]);

  /** Client-side preview of a draft row's amount (server recomputes on save). */
  function previewAmount(c: LineComponent, basicAmount: number): number {
    if (c.calculationType === "UNIT_RATE") return c.rate * (c.quantity ?? 0);
    if (c.calculationType === "PERCENTAGE_OF_BASIC") return (basicAmount * c.rate) / 100;
    return c.rate;
  }

  const handleSaveLine = async (l: PayrollLine) => {
    setSaving(true);
    try {
      // Overtime stays a lump field (attendance-computed, not component-driven).
      const ot = parseFloat(editOvertime);
      if (!isNaN(ot) && ot !== l.overtimeAmount) {
        const res = await fetch(`/api/payroll/${period.id}/lines/${l.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overtimeAmount: ot }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update overtime");
        }
      }

      const res = await fetch(`/api/payroll/${period.id}/lines/${l.id}/components`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          components: editComponents.map((c) => ({
            type: c.type,
            label: c.label,
            calculationType: c.calculationType,
            unitType: c.unitType,
            unitLabel: c.unitLabel,
            rate: c.rate,
            quantity: c.quantity,
            isDeduction: c.isDeduction,
            notes: c.notes,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update components");
      }

      toast.success("Payroll line updated");
      setEditingLine(null);
      try {
        const refreshRes = await fetch(`/api/payroll/${period.id}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setLines(data.lines ?? []);
        }
      } catch (err) { console.warn("Payroll refresh failed:", err); }
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  function startEdit(l: PayrollLine) {
    setEditingLine(l.id);
    setExpandedLine(l.id);
    setEditOvertime(l.overtimeAmount.toString());
    setEditComponents((l.components ?? []).map((c) => ({ ...c })));
    setAddType("OTHER"); setAddLabel(""); setAddCalc("FIXED");
    setAddRate(""); setAddUnit("DAY"); setAddQty(""); setAddIsDeduction(false);
  }

  function handleAddComponent() {
    const rate = parseFloat(addRate);
    if (!addRate || isNaN(rate) || rate <= 0) {
      toast.error(addCalc === "PERCENTAGE_OF_BASIC" ? "Enter a valid %" : "Enter a valid rate");
      return;
    }
    const qty = addCalc === "UNIT_RATE" ? (parseFloat(addQty) || 0) : null;
    setEditComponents((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        type: addType,
        label: addLabel.trim() || LINE_COMPONENT_LABELS[addType] || addType,
        calculationType: addCalc,
        unitType: addCalc === "UNIT_RATE" ? addUnit : null,
        unitLabel: null,
        rate,
        quantity: qty,
        amount: 0, // preview computed client-side; server recomputes on save
        bucket: "",
        isDeduction: addType === "OTHER" ? addIsDeduction
          : ["EMPLOYEE_PF", "EMPLOYEE_ESI", "PROFESSION_TAX", "TDS"].includes(addType),
        notes: null,
      },
    ]);
    setAddType("OTHER"); setAddLabel(""); setAddCalc("FIXED");
    setAddRate(""); setAddUnit("DAY"); setAddQty(""); setAddIsDeduction(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${MONTHS[period.month]} ${period.year} — Payroll Lines`} className="max-w-4xl">
      {loading ? (
        <div className="py-8 text-center text-meta text-muted-foreground">Loading…</div>
      ) : lines && lines.length > 0 ? (
        <Table>
          <THead>
            <TR>
              <TH></TH>
              <TH>Employee</TH>
              <TH>Days</TH>
              <TH>Basic</TH>
              <TH>OT</TH>
              <TH>Allow.</TH>
              <TH>Bonus</TH>
              <TH>PF</TH>
              <TH>Er. PF</TH>
              <TH>ESI</TH>
              <TH>Prof. Tax</TH>
              <TH>Tax</TH>
              <TH>Deduct.</TH>
              <TH>Net Pay</TH>
              {canEdit && <TH></TH>}
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const isEditing = editingLine === l.id;
              const isExpanded = expandedLine === l.id || isEditing;
              const displayComponents = isEditing ? editComponents : (l.components ?? []);
              // Live bucket preview while editing — server recomputes on save.
              const preview = (() => {
                const s = { allowance: 0, bonus: 0, pf: 0, employerPf: 0, esi: 0, professionTax: 0, tax: 0, deductions: 0 };
                for (const c of editComponents) {
                  const amt = previewAmount(c, l.basicAmount);
                  const b = c.bucket || previewBucket(c.type, c.isDeduction);
                  if (b === "ALLOWANCE") s.allowance += amt;
                  else if (b === "BONUS") s.bonus += amt;
                  else if (b === "PF") s.pf += amt;
                  else if (b === "EMPLOYER_PF") s.employerPf += amt;
                  else if (b === "ESI") s.esi += amt;
                  else if (b === "PROFESSION_TAX") s.professionTax += amt;
                  else if (b === "TAX") s.tax += amt;
                  else if (b === "DEDUCTIONS") s.deductions += amt;
                }
                return s;
              })();
              const otVal = parseFloat(editOvertime) || 0;
              const previewNet = l.basicAmount + otVal + preview.allowance + preview.bonus
                - (preview.deductions + preview.pf + preview.esi + preview.professionTax + preview.tax);
              return (
                <Fragment key={l.id}>
                  <TR>
                    <TD className="w-6 pr-0">
                      <button
                        onClick={() => setExpandedLine(isExpanded && !isEditing ? null : l.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                        title="Show breakdown"
                      >
                        <Eye className={cn("h-3.5 w-3.5", isExpanded && "text-foreground")} />
                      </button>
                    </TD>
                    <TD>
                      <div className="font-medium"><EmployeeName id={l.employeeId} name={l.employeeName} /></div>
                      <div className="text-caption text-muted-foreground">{l.trade ?? l.wageType}</div>
                    </TD>
                    <TD className="tnum">{l.daysWorked}</TD>
                    <TD className="tnum">{formatCurrency(l.basicAmount)}</TD>
                    <TD className="tnum">
                      {isEditing ? (
                        <Input type="number" value={editOvertime} onChange={(e) => setEditOvertime(e.target.value)} className="h-7 w-16 px-1 text-caption" step="0.01" min="0" />
                      ) : formatCurrency(l.overtimeAmount)}
                    </TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.allowance : l.allowance)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.bonus : l.bonus)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.pf : l.pf)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.employerPf : l.employerPf)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.esi : l.esi)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.professionTax : l.professionTax)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.tax : l.tax)}</TD>
                    <TD className="tnum">{formatCurrency(isEditing ? preview.deductions : l.deductions)}</TD>
                    <TD className="tnum font-bold">{formatCurrency(isEditing ? previewNet : l.netPay)}</TD>
                    {canEdit && (
                      <TD>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleSaveLine(l)} disabled={saving} className="rounded p-0.5 text-success hover:bg-success/10" title="Save">
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => setEditingLine(null)} className="rounded p-0.5 text-muted-foreground hover:bg-accent" title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(l)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </TD>
                    )}
                  </TR>
                  {isExpanded && (
                    <TR className="bg-muted/20">
                      <TD colSpan={canEdit ? 15 : 14} className="p-0">
                        <div className="px-4 py-2 space-y-1.5">
                          {displayComponents.length === 0 ? (
                            <p className="text-caption text-muted-foreground py-1">
                              No itemized components — this line is just basic + overtime.
                              {isEditing ? " Add one below." : ""}
                            </p>
                          ) : (
                            <table className="w-full text-caption">
                              <tbody>
                                {displayComponents.map((c, idx) => (
                                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                                    <td className="py-1 pr-2">
                                      <span className="font-medium text-foreground">{c.label}</span>
                                      <span className="ml-1.5 text-muted-foreground">{rateDescription(c)}</span>
                                      {c.bucket === "EMPLOYER_ONLY" && (
                                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-micro text-muted-foreground">employer</span>
                                      )}
                                    </td>
                                    <td className="py-1 pr-2 w-28">
                                      {isEditing && c.calculationType === "UNIT_RATE" ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            value={c.quantity ?? 0}
                                            onChange={(e) => setEditComponents((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: parseFloat(e.target.value) || 0 } : p))}
                                            className="h-6 w-16 px-1 text-micro"
                                            step="0.01" min="0"
                                          />
                                          <span className="text-micro text-muted-foreground">{(c.unitType === "CUSTOM" ? c.unitLabel : c.unitType?.toLowerCase()) ?? "units"}</span>
                                        </div>
                                      ) : c.calculationType === "UNIT_RATE" ? (
                                        <span className="text-muted-foreground">× {c.quantity ?? 0} {(c.unitType === "CUSTOM" ? c.unitLabel : c.unitType?.toLowerCase()) ?? "units"}</span>
                                      ) : isEditing ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            value={c.rate}
                                            onChange={(e) => setEditComponents((prev) => prev.map((p, i) => i === idx ? { ...p, rate: parseFloat(e.target.value) || 0 } : p))}
                                            className="h-6 w-20 px-1 text-micro"
                                            step="0.01" min="0"
                                          />
                                          {c.calculationType === "PERCENTAGE_OF_BASIC" && <span className="text-micro text-muted-foreground">%</span>}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className={cn("py-1 pr-2 tnum text-right w-20", c.isDeduction || c.bucket === "EMPLOYER_ONLY" ? "text-danger" : "text-foreground")}>
                                      {c.isDeduction ? "−" : ""}{formatCurrency(previewAmount(c, l.basicAmount))}
                                    </td>
                                    <td className="py-1 w-6">
                                      {isEditing && (
                                        <button onClick={() => setEditComponents((prev) => prev.filter((_, i) => i !== idx))} className="rounded p-0.5 text-danger hover:bg-danger/10" title="Remove">
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {/* Add component (edit mode) */}
                          {isEditing && (
                            <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/50">
                              <div>
                                <div className="text-micro text-muted-foreground mb-0.5">Type</div>
                                <Select value={addType} onChange={(e) => setAddType(e.target.value)} className="h-7 w-36 text-caption">
                                  {LINE_COMPONENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </Select>
                              </div>
                              {addType === "OTHER" && (
                                <div>
                                  <div className="text-micro text-muted-foreground mb-0.5">Label</div>
                                  <Input value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder="e.g. Site allowance" className="h-7 w-32 text-caption" />
                                </div>
                              )}
                              <div>
                                <div className="text-micro text-muted-foreground mb-0.5">Priced as</div>
                                <Select value={addCalc} onChange={(e) => setAddCalc(e.target.value as typeof addCalc)} className="h-7 w-32 text-caption">
                                  <option value="FIXED">Fixed amount</option>
                                  <option value="PERCENTAGE_OF_BASIC">% of basic</option>
                                  <option value="UNIT_RATE">Per unit (rate)</option>
                                </Select>
                              </div>
                              <div>
                                <div className="text-micro text-muted-foreground mb-0.5">{addCalc === "PERCENTAGE_OF_BASIC" ? "%" : addCalc === "UNIT_RATE" ? "Rate ₹" : "Amount ₹"}</div>
                                <Input type="number" value={addRate} onChange={(e) => setAddRate(e.target.value)} className="h-7 w-20 text-caption" step="0.01" min="0" />
                              </div>
                              {addCalc === "UNIT_RATE" && (
                                <>
                                  <div>
                                    <div className="text-micro text-muted-foreground mb-0.5">Unit</div>
                                    <Select value={addUnit} onChange={(e) => setAddUnit(e.target.value)} className="h-7 w-24 text-caption">
                                      <option value="DAY">per day</option>
                                      <option value="KM">per km</option>
                                      <option value="TRIP">per trip</option>
                                      <option value="HOUR">per hour</option>
                                      <option value="MONTH">per month</option>
                                    </Select>
                                  </div>
                                  <div>
                                    <div className="text-micro text-muted-foreground mb-0.5">Qty</div>
                                    <Input type="number" value={addQty} onChange={(e) => setAddQty(e.target.value)} className="h-7 w-16 text-caption" step="0.01" min="0" />
                                  </div>
                                </>
                              )}
                              {addType === "OTHER" && (
                                <label className="flex items-center gap-1 text-micro text-muted-foreground pb-1.5">
                                  <input type="checkbox" checked={addIsDeduction} onChange={(e) => setAddIsDeduction(e.target.checked)} className="h-3 w-3" />
                                  Deduct
                                </label>
                              )}
                              <Button size="sm" variant="outline" onClick={handleAddComponent} className="h-7 text-caption">
                                <Plus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            </div>
                          )}
                        </div>
                      </TD>
                    </TR>
                  )}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <div className="py-8 text-center text-meta text-muted-foreground">No payroll lines found</div>
      )}
    </Dialog>
  );
}
