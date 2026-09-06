"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useConfirm } from "@/lib/use-confirm";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

interface MaterialEditData {
  id: string;
  code: string;
  name: string;
  grade: string | null;
  specification: string | null;
  categoryId: string;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  standardCost: number;
  reorderPoint: number | null;
  economicOrderQty: number | null;
  description: string | null;
  version: number;
}

interface Category {
  id: string;
  name: string;
}

/**
 * MobileStockDetailActions — Edit + Delete buttons for the mobile stock
 * (material) detail page. The page is a Server Component, so this is a
 * thin client wrapper that renders the action buttons and dialogs.
 */
export function MobileStockDetailActions({
  material,
  categories,
  canManage,
}: {
  material: MaterialEditData;
  categories: Category[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete material "${material.name}"?`,
      description: "This will archive the material. Stock history will remain.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/materials/${material.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      haptic(10);
      toast.success("Material archived");
      router.push("/m/stock");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  if (!canManage) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 mb-3">
        <button
          onClick={() => setShowEdit(true)}
          className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] text-m-body press"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] text-m-body press"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-stop)" }}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      </div>

      {showEdit ? (
        <EditMaterialModal
          material={material}
          categories={categories}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}

function EditMaterialModal({
  material,
  categories,
  onClose,
  onSuccess,
}: {
  material: MaterialEditData;
  categories: Category[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState(material.code);
  const [name, setName] = useState(material.name);
  const [grade, setGrade] = useState(material.grade ?? "");
  const [specification, setSpecification] = useState(material.specification ?? "");
  const [categoryId, setCategoryId] = useState(material.categoryId);
  const [unit, setUnit] = useState(material.unit);
  const [hsnCode, setHsnCode] = useState(material.hsnCode ?? "");
  const [gstRate, setGstRate] = useState(String(material.gstRate));
  const [standardCost, setStandardCost] = useState(String(material.standardCost));
  const [reorderPoint, setReorderPoint] = useState(material.reorderPoint != null ? String(material.reorderPoint) : "");
  const [economicOrderQty, setEconomicOrderQty] = useState(material.economicOrderQty != null ? String(material.economicOrderQty) : "");
  const [description, setDescription] = useState(material.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          grade: grade || null,
          specification: specification || null,
          categoryId,
          unit,
          hsnCode: hsnCode || null,
          gstRate: Number(gstRate) || 0,
          standardCost: Number(standardCost) || 0,
          reorderPoint: reorderPoint ? Number(reorderPoint) : null,
          economicOrderQty: economicOrderQty ? Number(economicOrderQty) : null,
          description: description || null,
          version: material.version,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      haptic(10);
      toast.success("Material updated");
      onSuccess();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={true} onClose={onClose} title="Edit Material">
      <form onSubmit={handleSubmit}>
        <div className="p-3 flex flex-col gap-3">
          <Field label="Code *">
            <input required value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Name *">
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Category *">
            <MobileSelectWithCreate
              label="Category"
              required
              value={categoryId}
              onChange={setCategoryId}
              placeholder="— Select category —"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit *">
              <input required value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Grade">
              <input value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="HSN Code">
              <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className={inputCls} />
            </Field>
            <Field label="GST Rate %">
              <input type="number" step="0.01" value={gstRate} onChange={(e) => setGstRate(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Standard Cost">
            <input type="number" step="0.01" value={standardCost} onChange={(e) => setStandardCost(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Reorder Point">
              <input type="number" step="0.001" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} className={inputCls} />
            </Field>
            <Field label="EOQ">
              <input type="number" step="0.001" value={economicOrderQty} onChange={(e) => setEconomicOrderQty(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Specification">
            <input value={specification} onChange={(e) => setSpecification(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </Field>
        </div>
        <div className="p-3 border-t flex gap-2 sticky bottom-0" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[0.5rem] py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-body font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <><Check className="size-3.5" /><span>Save</span></>}
          </button>
        </div>
      </form>
    </MobileDialog>
  );
}

const inputCls =
  "w-full rounded-[0.375rem] border px-2.5 py-1.5 text-m-section";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
