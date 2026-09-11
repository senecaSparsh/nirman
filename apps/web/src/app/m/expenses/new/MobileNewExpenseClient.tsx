"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Save, IndianRupee, CheckCircle2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTodayDateState } from "@/lib/use-today-date";
import { SectionCard, SelectorModal, EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobilePageHeader } from "@/components/mobile/v2/primitives";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";

type Project = { id: string; name: string };
type Category = { id: string; name: string };
type Supplier = { id: string; name: string };

export function MobileNewExpenseClient({
  projects,
  categories,
  suppliers,
  currentUserId: _currentUserId,
}: {
  projects: Project[];
  categories: Category[];
  suppliers: Supplier[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [success, setSuccess] = useState<{ id: string; submitted: boolean } | null>(null);
  const [modal, setModal] = useState<"project" | "category" | "supplier" | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState<"supplier" | "project" | null>(null);
  const [extraProjects, setExtraProjects] = useState<Project[]>([]);
  const [extraSuppliers, setExtraSuppliers] = useState<Supplier[]>([]);
  const [today] = useTodayDateState();

  useEffect(() => {
    if (!date && today) setDate(today);
  }, [date, today]);

  const numAmount = Number(amount) || 0;

  async function handleSubmit(submit: boolean) {
    if (!category.trim()) {
      toast.error("Category is required");
      return;
    }
    if (numAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || null,
          categoryId: categoryId || null,
          category: category.trim(),
          amount: numAmount,
          payeeName: payeeName || null,
          supplierId: supplierId || null,
          paymentMode,
          referenceNo: referenceNo || null,
          notes: notes || null,
          date: date || today,
          submitForApproval: submit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create expense");
      setSuccess({ id: data.id, submitted: submit });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-9 px-2 text-m-body outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-1";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div>
      {/* ── Success state ── */}
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div
            className="grid place-items-center size-14 rounded-full mb-3"
            style={{ backgroundColor: success.submitted ? "color-mix(in srgb, var(--color-go) 12%, transparent)" : "color-mix(in srgb, var(--color-signal) 12%, transparent)" }}
          >
            <CheckCircle2 className="size-7" style={{ color: success.submitted ? "var(--color-go)" : "var(--color-signal)" }} />
          </div>
          <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
            {success.submitted ? "Expense Submitted" : "Expense Saved as Draft"}
          </p>
          <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-700)" }}>
            {success.submitted
              ? "It's now in the approval queue for a manager to review."
              : "You can submit it for approval from the expense list."}
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => {
                // Reset form for another expense
                setSuccess(null);
                setProjectId(""); setCategoryId(""); setCategory(""); setAmount("");
                setPayeeName(""); setSupplierId(""); setReferenceNo(""); setNotes("");
                setPaymentMode("BANK");
                setExtraProjects([]); setExtraSuppliers([]);
                router.refresh();
              }}
              className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-4 inline mr-1" /> Add Another
            </button>
            <button
              onClick={() => router.push("/m/expenses")}
              className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
            >
              <Eye className="size-4 inline mr-1" /> View Expenses
            </button>
          </div>
        </div>
      ) : (
      <>
      <MobilePageHeader title="New Expense" subtitle="Record what was spent" />
      <div className="px-3 py-3 flex flex-col gap-3">
        {/* Project selector */}
        <SectionCard title="Project">
          <button
            onClick={() => setModal("project")}
            className="w-full text-left"
          >
            <span className={labelClass} style={labelStyle}>Project (optional)</span>
            <span className="text-m-body" style={{ color: projectId ? "var(--color-ink-950)" : "var(--color-ink-500)" }}>
              {[...projects, ...extraProjects].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).find((p) => p.id === projectId)?.name ?? "Select project…"}
            </span>
          </button>
        </SectionCard>

        {/* Category */}
        <SectionCard title="Category">
          {categories.length > 0 ? (
            <button onClick={() => setModal("category")} className="w-full text-left">
              <span className={labelClass} style={labelStyle}>Category *</span>
              <span className="text-m-body" style={{ color: category ? "var(--color-ink-950)" : "var(--color-ink-500)" }}>
                {category || "Select category…"}
              </span>
            </button>
          ) : (
            <div>
              <span className={labelClass} style={labelStyle}>Category *</span>
              <input
                value={category}
                onChange={(e) => { setCategory(e.target.value); setCategoryId(""); }}
                placeholder="e.g. Transportation, Fuel"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}
        </SectionCard>

        {/* Amount */}
        <SectionCard title="Amount">
          <span className={labelClass} style={labelStyle}>Amount (₹) *</span>
          <div className="flex items-center gap-2">
            <IndianRupee className="size-4" style={{ color: "var(--color-ink-500)" }} />
            <input
              type="number"
              min="0"
              step="any"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </SectionCard>

        {/* Payee */}
        <SectionCard title="Payee">
          <span className={labelClass} style={labelStyle}>Payee (optional)</span>
          <input
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            placeholder="Who was paid?"
            className={inputClass}
            style={inputStyle}
          />
        </SectionCard>

        {/* Supplier */}
        <SectionCard title="Supplier">
          <button onClick={() => setModal("supplier")} className="w-full text-left">
            <span className={labelClass} style={labelStyle}>Supplier (optional)</span>
            <span className="text-m-body" style={{ color: supplierId ? "var(--color-ink-950)" : "var(--color-ink-500)" }}>
              {[...suppliers, ...extraSuppliers].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i).find((s) => s.id === supplierId)?.name ?? "Select supplier…"}
            </span>
          </button>
        </SectionCard>

        {/* Payment mode + date */}
        <SectionCard title="Payment">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <EnumSelect
                label="Payment Mode"
                value={paymentMode}
                onChange={setPaymentMode}
                options={[
                  { value: "BANK", label: "Bank Transfer" },
                  { value: "CASH", label: "Cash" },
                  { value: "CHEQUE", label: "Cheque" },
                  { value: "UPI", label: "UPI" },
                  { value: "NEFT", label: "NEFT" },
                ]}
              />
            </div>
            <div>
              <span className={labelClass} style={labelStyle}>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
        </SectionCard>

        {/* Reference */}
        <SectionCard title="Reference">
          <span className={labelClass} style={labelStyle}>Reference No. (optional)</span>
          <input
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="UTR / Cheque no."
            className={inputClass}
            style={inputStyle}
          />
        </SectionCard>

        {/* Notes */}
        <SectionCard title="Notes">
          <span className={labelClass} style={labelStyle}>Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was this expense for?"
            rows={2}
            className={inputClass}
            style={inputStyle}
          />
        </SectionCard>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2 pb-6">
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Draft
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit
          </button>
        </div>
      </div>
      </>
      )}

      {/* Selector modals */}
      {modal === "project" && (
        <SelectorModal
          title="Select Project"
          selectedId={projectId}
          items={[...projects, ...extraProjects].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).map((p) => ({ id: p.id, label: p.name }))}
          onSelect={(id) => { setProjectId(id); setModal(null); }}
          onClose={() => setModal(null)}
          onCreate={() => { setShowCreateDialog("project"); }}
          createLabel="Create new project"
        />
      )}
      {modal === "category" && (
        <SelectorModal
          title="Select Category"
          selectedId={categoryId}
          items={categories.map((c) => ({ id: c.id, label: c.name }))}
          onSelect={(id) => {
            const cat = categories.find((c) => c.id === id);
            setCategoryId(id);
            setCategory(cat?.name ?? "");
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "supplier" && (
        <SelectorModal
          title="Select Supplier"
          selectedId={supplierId}
          items={[...suppliers, ...extraSuppliers].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i).map((s) => ({ id: s.id, label: s.name }))}
          onSelect={(id) => { setSupplierId(id); setModal(null); }}
          onClose={() => setModal(null)}
          onCreate={() => { setShowCreateDialog("supplier"); }}
          createLabel="Create new supplier"
        />
      )}

      {/* ══════ INLINE CREATE DIALOGS ══════ */}
      {showCreateDialog === "project" ? (
        <MobileFabModal open onClose={() => setShowCreateDialog(null)} title="New Project" nested>
          <MobileNewProjectDialog
            open
            onClose={() => setShowCreateDialog(null)}
            onCreated={(p) => {
              setExtraProjects((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, { id: p.id, name: p.name }]);
              setProjectId(p.id);
              setShowCreateDialog(null);
              setModal(null);
            }}
          />
        </MobileFabModal>
      ) : null}
      {showCreateDialog === "supplier" ? (
        <MobileNewSupplierDialog
          open
          nested
          onClose={() => setShowCreateDialog(null)}
          onCreated={(s) => {
            setExtraSuppliers((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, { id: s.id, name: s.name }]);
            setSupplierId(s.id);
            setShowCreateDialog(null);
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}
