"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";

/**
 * MobileNewDepartmentForm — create a Department (code + name + optional
 * description/active). Used by the /m/departments FAB and by entity
 * selectors via MobileDepartmentSelect's "+ Create new" path.
 */
export function MobileNewDepartmentForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (dept: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
          active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create department");
      }
      haptic([10, 40, 80]);
      toast.success("Department created");
      if (onCreated && data.id) {
        onCreated({ id: data.id, name: name.trim() });
      }
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create department");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Department Details */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Department Details
        </p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Code *
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BOILER"
              className="w-full h-7 px-1 text-m-caption font-mono outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
              required
            />
          </div>
          <div className="pl-2">
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Boiler House"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this department does…"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
          />
        </div>

        <label className="flex items-center gap-1 text-m-body" style={{ color: "var(--color-ink-500)" }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded"
          />
          Active department
        </label>
      </div>

      <div className="flex justify-end gap-1 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 h-10 rounded-[0.5rem] text-m-body font-medium press"
          style={{ color: "var(--color-ink-700)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
          style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}

/**
 * MobileNewDepartmentDialog — bottom-sheet wrapper, for call sites that
 * don't already provide a MobileFabModal.
 */
export function MobileNewDepartmentDialog({
  open,
  onClose,
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (dept: { id: string; name: string }) => void;
  nested?: boolean;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Department" nested={nested}>
      <MobileNewDepartmentForm onClose={onClose} onCreated={onCreated} />
    </MobileDialog>
  );
}
