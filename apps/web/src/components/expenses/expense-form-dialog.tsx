"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload, X, FileText } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import type { ExpenseCategoryRow, ProjectOption } from "@/lib/types";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

const PAYMENT_MODES = ["CASH", "UPI", "NEFT", "BANK", "CHEQUE", "CREDIT"] as const;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export interface ExpenseFormValues {
  id?: string;
  projectId: string | null;
  categoryId: string | null;
  category: string;
  amount: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  tdsAmount: number;
  supplierId: string | null;
  payeeName: string | null;
  paymentMode: string | null;
  bankAccount: string | null;
  chequeNo: string | null;
  chequeDate: string | null;
  chequePhotoUrl: string | null;
  referenceNo: string | null;
  receiptUrl: string | null;
  date: string;
  notes: string | null;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  rejectedReason?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  projects,
  categories,
  suppliers,
  editing,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  categories: ExpenseCategoryRow[];
  suppliers: { id: string; name: string }[];
  editing?: ExpenseFormValues | null;
  defaults?: { projectId?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [submitOnSave, setSubmitOnSave] = useState(true);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    categoryId: "",
    category: "",
    amount: "",
    subtotal: "",
    cgst: "",
    sgst: "",
    igst: "",
    tdsAmount: "",
    supplierId: "",
    payeeName: "",
    paymentMode: "",
    bankAccount: "",
    chequeNo: "",
    chequeDate: "",
    referenceNo: "",
    date: todayISO(),
    notes: "",
  });
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);

  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  const isLocked = editing?.status === "PENDING" || editing?.status === "APPROVED";

  useEffect(() => {
    if (open && editing) {
      setForm({
        projectId: editing.projectId ?? "",
        categoryId: editing.categoryId ?? "",
        category: editing.category ?? "",
        amount: String(editing.amount ?? ""),
        subtotal: String(editing.subtotal ?? ""),
        cgst: String(editing.cgst ?? ""),
        sgst: String(editing.sgst ?? ""),
        igst: String(editing.igst ?? ""),
        tdsAmount: String(editing.tdsAmount ?? ""),
        supplierId: editing.supplierId ?? "",
        payeeName: editing.payeeName ?? "",
        paymentMode: editing.paymentMode ?? "",
        bankAccount: editing.bankAccount ?? "",
        chequeNo: editing.chequeNo ?? "",
        chequeDate: editing.chequeDate ? editing.chequeDate.slice(0, 10) : "",
        referenceNo: editing.referenceNo ?? "",
        date: editing.date ? editing.date.slice(0, 10) : todayISO(),
        notes: editing.notes ?? "",
      });
      setReceiptUrl(editing.receiptUrl ?? null);
      setSubmitOnSave(false);
    } else if (open && !editing) {
      setForm({
        projectId: defaults?.projectId ?? "", categoryId: "", category: "", amount: "",
        subtotal: "", cgst: "", sgst: "", igst: "", tdsAmount: "", supplierId: "",
        payeeName: "", paymentMode: "", bankAccount: "", chequeNo: "", chequeDate: "",
        referenceNo: "", date: todayISO(), notes: "",
      });
      setReceiptUrl(null);
      setReceiptName(null);
      setSubmitOnSave(false);
    }
  }, [open, editing, defaults]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // When a category master is selected, sync the free-text category name.
  function onCategoryChange(id: string) {
    set("categoryId", id);
    if (id) {
      const cat = categories.find((c) => c.id === id);
      if (cat) set("category", cat.name);
    }
  }

  // Auto-compute subtotal from amount and GST components.
  const amountNum = Number(form.amount) || 0;
  const gstNum = (Number(form.cgst) || 0) + (Number(form.sgst) || 0) + (Number(form.igst) || 0);
  const computedSubtotal = form.subtotal ? Number(form.subtotal) : Math.max(0, amountNum - gstNum);

  async function uploadReceipt(file: File) {
    setUploadingReceipt(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setReceiptUrl(data.url);
      setReceiptName(data.fileName ?? file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    if (!form.category.trim()) {
      toast.error("Category is required");
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId: form.projectId || null,
        categoryId: form.categoryId || null,
        category: form.category.trim(),
        amount,
        subtotal: computedSubtotal || amount,
        cgst: Number(form.cgst) || 0,
        sgst: Number(form.sgst) || 0,
        igst: Number(form.igst) || 0,
        tdsAmount: Number(form.tdsAmount) || 0,
        supplierId: form.supplierId || null,
        payeeName: form.payeeName.trim() || null,
        paymentMode: form.paymentMode || null,
        bankAccount: form.bankAccount.trim() || null,
        chequeNo: form.chequeNo.trim() || null,
        chequeDate: form.chequeDate || null,
        referenceNo: form.referenceNo.trim() || null,
        receiptUrl,
        date: form.date || null,
        notes: form.notes.trim() || null,
        submitForApproval: submitOnSave,
      };
      const res = await fetch(
        editing ? `/api/expenses/${editing.id}` : "/api/expenses",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? payload : payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save expense");
      toast.success(editing ? "Expense updated" : submitOnSave ? "Expense submitted for approval" : "Expense saved as draft");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? (isLocked ? "Expense Details" : "Edit Expense") : "Add Expense"}
      description="Record an operating expense. Drafts don't affect the books — GL posts on approval."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Rejection reason banner (for REJECTED expenses) */}
        {editing?.status === "REJECTED" && editing.rejectedReason && (
          <div className="rounded-md border border-danger-border bg-danger-soft p-3">
            <div className="text-caption font-medium text-danger">Rejection Reason</div>
            <div className="text-body text-foreground mt-0.5">{editing.rejectedReason}</div>
            <div className="text-caption text-muted-foreground mt-1">Fix the issue and resubmit for approval.</div>
          </div>
        )}

        {/* Approval info (for PENDING/APPROVED expenses — read-only view) */}
        {editing?.status === "PENDING" && editing.submittedByName && (
          <div className="rounded-md border border-warning-border bg-warning-soft p-2.5 text-caption text-warning">
            Submitted by {editing.submittedByName}{editing.submittedAt ? ` on ${formatDate(editing.submittedAt)}` : ""} — awaiting approval.
          </div>
        )}
        {editing?.status === "APPROVED" && editing.approvedByName && (
          <div className="rounded-md border border-success-border bg-success-soft p-2.5 text-caption text-success">
            Approved by {editing.approvedByName}{editing.approvedAt ? ` on ${formatDate(editing.approvedAt)}` : ""} — GL posted.
          </div>
        )}

        {/* Project + Category */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-project">Project</Label>
            <SelectWithCreate
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              placeholder="No project (company expense)"
              createLabel="project"
              options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => {
                  setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]);
                  onCreated(e);
                }} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-category">Category *</Label>
            {categories.length > 0 ? (
              <Select id="e-category" value={form.categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
                <option value="">— Select category —</option>
                {categories.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            ) : (
              <Input id="e-category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Office Supplies" required />
            )}
            {categories.length > 0 && (
              <Input
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Category name (auto-filled from master, editable)"
                className="h-8 text-[13px]"
                required
              />
            )}
          </div>
        </div>

        {/* Payee / Supplier */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-supplier">Vendor / Supplier</Label>
            <Select id="e-supplier" value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-payee">Payee (if not a vendor)</Label>
            <Input id="e-payee" value={form.payeeName} onChange={(e) => set("payeeName", e.target.value)} placeholder="e.g. BSES Electricity Board" disabled={isLocked} />
          </div>
        </div>

        {/* Amount + GST breakdown */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Total Amount *</Label>
              <Input id="e-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} required disabled={isLocked} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-subtotal">Subtotal (ex-tax)</Label>
              <Input id="e-subtotal" type="number" min="0" step="0.01" value={form.subtotal} onChange={(e) => set("subtotal", e.target.value)} placeholder={String(computedSubtotal)} disabled={isLocked} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-tds">TDS Deducted</Label>
              <Input id="e-tds" type="number" min="0" step="0.01" value={form.tdsAmount} onChange={(e) => set("tdsAmount", e.target.value)} disabled={isLocked} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-cgst">CGST</Label>
              <Input id="e-cgst" type="number" min="0" step="0.01" value={form.cgst} onChange={(e) => set("cgst", e.target.value)} disabled={isLocked} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-sgst">SGST</Label>
              <Input id="e-sgst" type="number" min="0" step="0.01" value={form.sgst} onChange={(e) => set("sgst", e.target.value)} disabled={isLocked} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-igst">IGST</Label>
              <Input id="e-igst" type="number" min="0" step="0.01" value={form.igst} onChange={(e) => set("igst", e.target.value)} disabled={isLocked} />
            </div>
          </div>
          <div className="text-caption text-muted-foreground">
            Subtotal <span className="tnum text-foreground">{formatCurrency(computedSubtotal)}</span>
            {" + GST "}<span className="tnum text-foreground">{formatCurrency(gstNum)}</span>
            {" = "}<span className="tnum font-medium text-foreground">{formatCurrency(amountNum)}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-mode">Payment Mode</Label>
            <Select id="e-mode" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)} disabled={isLocked}>
              <option value="">— Select —</option>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-bank">Bank / Account</Label>
            <Input id="e-bank" value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} placeholder="e.g. HDFC ****1234" disabled={isLocked} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-ref">Reference No.</Label>
            <Input id="e-ref" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} placeholder="UTR / Txn ID" disabled={isLocked} />
          </div>
        </div>

        {/* Cheque fields (only when CHEQUE) */}
        {form.paymentMode === "CHEQUE" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-cheque-no">Cheque No.</Label>
              <Input id="e-cheque-no" value={form.chequeNo} onChange={(e) => set("chequeNo", e.target.value)} disabled={isLocked} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-cheque-date">Cheque Date</Label>
              <Input id="e-cheque-date" type="date" value={form.chequeDate} onChange={(e) => set("chequeDate", e.target.value)} disabled={isLocked} />
            </div>
          </div>
        )}

        {/* Date + Receipt */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-date">Date</Label>
            <Input id="e-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} disabled={isLocked} />
          </div>
          <div className="space-y-1.5">
            <Label>Receipt / Bill</Label>
            {receiptUrl ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                <FileText className="h-4 w-4 text-brand" />
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="flex-1 truncate text-[13px] text-brand hover:underline">
                  {receiptName ?? "View receipt"}
                </a>
                {!isLocked && (
                  <button type="button" onClick={() => { setReceiptUrl(null); setReceiptName(null); }} className="text-muted-foreground hover:text-danger">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <label className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-caption text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-subtle",
                uploadingReceipt && "pointer-events-none opacity-60",
                isLocked && "pointer-events-none opacity-50",
              )}>
                {uploadingReceipt ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> Upload receipt</>}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={isLocked}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadReceipt(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="e-notes">Notes</Label>
          <Textarea id="e-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional" disabled={isLocked} />
        </div>

        <div className="flex justify-between items-center gap-2 pt-2">
          <div className="flex items-center gap-2">
            {!isLocked && !editing && (
              <label className="flex items-center gap-1.5 text-caption text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={submitOnSave}
                  onChange={(e) => setSubmitOnSave(e.target.checked)}
                  className="size-3.5 rounded border-border"
                />
                Submit for approval
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {isLocked ? "Close" : "Cancel"}
            </Button>
            {!isLocked && (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : submitOnSave ? "Submit for Approval" : "Save Draft"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
