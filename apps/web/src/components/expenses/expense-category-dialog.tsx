"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, FolderOpen } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ExpenseCategoryRow, GlAccountOption } from "@/lib/types";
import { EmptyState } from "@/components/empty-state";

export function ExpenseCategoryDialog({
  open,
  onOpenChange,
  categories,
  glAccounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategoryRow[];
  glAccounts: GlAccountOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ExpenseCategoryRow | null>(null);
  const [form, setForm] = useState({ name: "", glAccountCode: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Only show EXPENSE-type GL accounts as mapping targets (plus the existing
  // mapped code in case it's a non-expense account kept for backward compat).
  const expenseAccounts = glAccounts.filter((a) => a.type === "EXPENSE" || a.type === "CONTRA_EXPENSE");

  useEffect(() => {
    if (open) {
      setEditing(null);
      setForm({ name: "", glAccountCode: "", description: "" });
    }
  }, [open]);

  function startEdit(cat: ExpenseCategoryRow) {
    setEditing(cat);
    setForm({ name: cat.name, glAccountCode: cat.glAccountCode, description: cat.description ?? "" });
  }

  function reset() {
    setEditing(null);
    setForm({ name: "", glAccountCode: "", description: "" });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.glAccountCode) {
      toast.error("Name and GL account are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/expense-categories/${editing.id}` : "/api/expense-categories",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            glAccountCode: form.glAccountCode,
            description: form.description.trim() || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save category");
      toast.success(editing ? "Category updated" : "Category created");
      reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/expense-categories/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(data.deactivated ? "Category deactivated (in use)" : "Category deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Expense Categories"
      description="Master categories map each expense type to a GL account so postings hit the right ledger line."
      className="max-w-xl"
    >
      <div className="space-y-4">
        {/* Form */}
        <form onSubmit={onSave} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-subhead font-medium">{editing ? "Edit Category" : "New Category"}</h4>
            {editing && (
              <button type="button" onClick={reset} className="text-caption text-muted-foreground hover:text-foreground">Cancel edit</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name *</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Office Supplies" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-gl">GL Account *</Label>
              <Select id="cat-gl" value={form.glAccountCode} onChange={(e) => setForm((f) => ({ ...f, glAccountCode: e.target.value }))} required>
                <option value="">— Select —</option>
                {expenseAccounts.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea id="cat-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {editing ? "Update" : "Add Category"}
            </Button>
          </div>
        </form>

        {/* List */}
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {categories.length === 0 ? (
            <EmptyState
              icon={<FolderOpen />}
              title="No categories yet"
              description="Create one above."
              size="compact"
            />
          ) : (
            categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{cat.name}</span>
                    {!cat.isActive && <Badge variant="muted">inactive</Badge>}
                  </div>
                  <div className="text-caption text-muted-foreground">
                    <span className="tnum">{cat.glAccountCode}</span>
                    {cat.description && <span className="ml-2">· {cat.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => startEdit(cat)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(cat.id)}
                    disabled={deletingId === cat.id}
                    className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    title="Delete"
                  >
                    {deletingId === cat.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
