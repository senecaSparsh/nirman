"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SectionCard,
  UnderlineInput,
  EnumSelect,
  StickyActionBar,
} from "@/components/mobile/v2/form-primitives";
import { haptic } from "@/lib/haptic";
import { localDateISO } from "@/lib/utils";

export type PlannedOption = { id: string; name: string };
export type PlannedCategory = { id: string; name: string };

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

const PAYMENT_MODES = ["CASH", "UPI", "NEFT", "BANK", "CHEQUE"].map((m) => ({ value: m, label: m }));

/**
 * MobileRecurringForm — set up a recurring expense (site rent, utilities,
 * monthly retainers) from the Accounts hub. Mirrors the desktop form on
 * /recurring-expenses — POSTs to /api/recurring-expenses.
 */
export function MobileRecurringForm({
  projects,
  categories,
  suppliers,
  onClose,
}: {
  projects: PlannedOption[];
  categories: PlannedCategory[];
  suppliers: PlannedOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [startDate, setStartDate] = useState(localDateISO());
  const [endDate, setEndDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function pickCategory(id: string) {
    setCategoryId(id);
    setCategory(categories.find((c) => c.id === id)?.name ?? "");
  }

  async function submit() {
    if (!category.trim() || !startDate) {
      toast.error("Category and start date are required");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (endDate && endDate < startDate) {
      toast.error("End date can't be before the start date");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/recurring-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || null,
          categoryId: categoryId || null,
          category: category.trim(),
          amount: amt,
          frequency,
          startDate,
          endDate: endDate || null,
          payeeName: payeeName || null,
          supplierId: supplierId || null,
          paymentMode: paymentMode || null,
          notes: notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create recurring expense");
      haptic(20);
      toast.success(`Recurring expense set — ${category}`);
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="What repeats">
        {categories.length > 0 ? (
          <EnumSelect
            label="Category"
            required
            value={categoryId}
            onChange={pickCategory}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select category…"
          />
        ) : null}
        <UnderlineInput
          label={categories.length > 0 ? "Category label" : "Category"}
          required={categories.length === 0}
          value={category}
          onChange={setCategory}
          placeholder="e.g. Site rent, Electricity, Retainer"
        />
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Amount (₹)"
            required
            value={amount}
            onChange={setAmount}
            type="number"
            inputMode="decimal"
            placeholder="0"
          />
          <EnumSelect
            label="Frequency"
            required
            value={frequency}
            onChange={setFrequency}
            options={FREQUENCIES}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput label="Start date" required type="date" value={startDate} onChange={setStartDate} />
          <UnderlineInput label="End date" type="date" value={endDate} onChange={setEndDate} placeholder="No end" />
        </div>
      </SectionCard>

      <SectionCard title="Who & where">
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <EnumSelect
            label="Project"
            value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Company-wide"
          />
          <EnumSelect
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="None"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput label="Payee name" value={payeeName} onChange={setPayeeName} placeholder="If not a supplier" />
          <EnumSelect
            label="Payment mode"
            value={paymentMode}
            onChange={setPaymentMode}
            options={PAYMENT_MODES}
            placeholder="—"
          />
        </div>
        <UnderlineInput label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
      </SectionCard>

      <StickyActionBar
        summaryLabel={frequency.charAt(0) + frequency.slice(1).toLowerCase()}
        summaryValue={amount ? `₹${Number(amount).toLocaleString("en-IN")}` : "—"}
        submitLabel="Set recurring expense"
        onSubmit={submit}
        submitting={submitting}
      />
    </div>
  );
}

/**
 * MobileBudgetForm — allocate an expense budget for a category+period.
 * Actuals vs budget surface as a variance bar on the list row.
 */
export function MobileBudgetForm({
  projects,
  categories,
  onClose,
}: {
  projects: PlannedOption[];
  categories: PlannedCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [categoryId, setCategoryId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState(localDateISO(firstOfMonth));
  const [periodEnd, setPeriodEnd] = useState(localDateISO(lastOfMonth));
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function pickCategory(id: string) {
    setCategoryId(id);
    setCategory(categories.find((c) => c.id === id)?.name ?? "");
  }

  async function submit() {
    if (!category.trim() || !periodStart || !periodEnd) {
      toast.error("Category and period are required");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Budget amount must be greater than 0");
      return;
    }
    if (periodEnd < periodStart) {
      toast.error("Period end can't be before period start");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/expense-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || null,
          categoryId: categoryId || null,
          category: category.trim(),
          amount: amt,
          periodStart,
          periodEnd,
          notes: notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to set budget");
      haptic(20);
      toast.success(`Budget set — ${category}`);
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="Budget">
        {categories.length > 0 ? (
          <EnumSelect
            label="Category"
            required
            value={categoryId}
            onChange={pickCategory}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select category…"
          />
        ) : null}
        <UnderlineInput
          label={categories.length > 0 ? "Category label" : "Category"}
          required={categories.length === 0}
          value={category}
          onChange={setCategory}
          placeholder="e.g. Site rent, Fuel, Labour welfare"
        />
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Budget (₹)"
            required
            value={amount}
            onChange={setAmount}
            type="number"
            inputMode="decimal"
            placeholder="0"
          />
          <EnumSelect
            label="Project"
            value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Company-wide"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput label="Period start" required type="date" value={periodStart} onChange={setPeriodStart} />
          <UnderlineInput label="Period end" required type="date" value={periodEnd} onChange={setPeriodEnd} />
        </div>
        <UnderlineInput label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
      </SectionCard>

      <StickyActionBar
        summaryLabel="Budget"
        summaryValue={amount ? `₹${Number(amount).toLocaleString("en-IN")}` : "—"}
        submitLabel="Set budget"
        onSubmit={submit}
        submitting={submitting}
      />
    </div>
  );
}
