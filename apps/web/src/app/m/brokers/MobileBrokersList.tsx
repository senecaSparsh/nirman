"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {Phone, Briefcase, Trash2, X} from "lucide-react";
import {
  MobileSearchHeader,
  MobileCardGrid,
  MobileFab,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { haptic } from "@/lib/haptic";
import { formatNumber } from "@/lib/utils";

export type BrokerListItem = {
  id: string;
  name: string;
  phone: string | null;
  agency: string | null;
  defaultCommissionPercent: number | null;
  notes: string | null;
  dealCount: number;
};

/**
 * Broker directory — card grid with agency accent and deal count.
 * Tap a card to edit inline; FAB adds a new broker.
 */
export function MobileBrokersList({
  items,
  canCreate,
  canEdit,
  canDelete = false,
}: {
  items: BrokerListItem[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<BrokerListItem | null>(null);
  const [creating, _setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((b) =>
      [b.name, b.phone, b.agency, b.notes].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
    );
  }, [items, query]);

  const summaryStats: SummaryStat[] = [
    { label: "Brokers", value: String(items.length) },
    { label: "Deals", value: String(items.reduce((s, b) => s + b.dealCount, 0)) },
    {
      label: "Avg Commission",
      value: items.length > 0
        ? `${formatNumber(items.reduce((s, b) => s + (b.defaultCommissionPercent ?? 0), 0) / items.length, 1)}%`
        : "—",
    },
  ];

  return (
    <div>
      <MobileSummaryStrip stats={summaryStats} />

      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search broker, agency, phone…"
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {filtered.length === 0 ? (
        <MobileNoResults
          title={query ? "No matching brokers" : "No brokers"}
          hint={query ? "Try a different search" : canCreate ? "Tap + to add your first broker" : "Brokers will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((b) => (
            <BrokerCard key={b.id} b={b} canEdit={canEdit} onEdit={() => setEditing(b)} />
          ))}
        </MobileCardGrid>
      )}

      {canCreate ? (
        <MobileFab href="/m/brokers/new" label="Add broker" />
      ) : null}

      {editing ? (
        <BrokerEditSheet
          broker={editing}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {creating ? null : null}
    </div>
  );
}

/* ─── Broker card ─── */
function BrokerCard({
  b,
  canEdit,
  onEdit,
}: {
  b: BrokerListItem;
  canEdit?: boolean;
  onEdit: () => void;
}) {
  const hasDeals = b.dealCount > 0;
  const accentColor = hasDeals ? "var(--color-go)" : "var(--color-steel)";

  return (
    <div
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />
      <button
        onClick={onEdit}
        disabled={!canEdit}
        className="p-2 flex flex-col gap-1 flex-1 text-left active:scale-[0.98] transition-transform disabled:active:scale-100 press"
      >
        <div className="flex items-center justify-between gap-1">
          <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {b.name}
          </p>
          {b.defaultCommissionPercent != null && (
            <span className="text-m-caption font-bold tabular-nums shrink-0" style={{ color: "var(--color-steel)" }}>
              {formatNumber(b.defaultCommissionPercent, 2)}%
            </span>
          )}
        </div>
        {b.agency && (
          <span className="text-m-caption font-semibold truncate flex items-center gap-0.5" style={{ color: "var(--color-ink-700)" }}>
            <Briefcase className="size-2" />
            {b.agency}
          </span>
        )}
        {b.phone && (
          <span className="text-m-caption truncate flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
            <Phone className="size-2" />
            {b.phone}
          </span>
        )}
        <div className="mt-auto pt-1 h-[1rem] flex items-center">
          {hasDeals ? (
            <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {b.dealCount} Deal{b.dealCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
              No deals yet
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

/* ─── Inline edit sheet (bottom sheet style) ─── */
function BrokerEditSheet({
  broker,
  canDelete = false,
  onClose,
}: {
  broker: BrokerListItem;
  canDelete?: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(broker.name);
  const [phone, setPhone] = useState(broker.phone ?? "");
  const [agency, setAgency] = useState(broker.agency ?? "");
  const [commission, setCommission] = useState(
    broker.defaultCommissionPercent != null ? String(broker.defaultCommissionPercent) : "",
  );
  const [notes, setNotes] = useState(broker.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/brokers/${broker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          agency: agency.trim() || null,
          defaultCommissionPercent: commission ? Number(commission) : null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Broker updated");
      onClose();
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setSaving(true);
    try {
      const res = await fetch(`/api/brokers/${broker.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      haptic([10, 40, 80]);
      toast.success("Broker deleted");
      onClose();
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[1rem] mx-auto max-w-md max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            Edit Broker
          </p>
          <button onClick={onClose} className="text-m-body press p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        {/* Form */}
        <div className="px-3 pb-4 flex flex-col gap-3">
          {confirmDelete ? (
            <div className="rounded-[0.5rem] border p-3 flex flex-col gap-2" style={{ borderColor: "var(--color-danger, #dc2626)" }}>
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                Delete &quot;{broker.name}&quot;?
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                This won&apos;t affect past sales that reference this broker.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 h-8 rounded-[0.375rem] border text-m-caption font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={del}
                  disabled={saving}
                  className="flex-1 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                  style={{ backgroundColor: "var(--color-danger, #dc2626)", color: "var(--color-paper)" }}
                >
                  {saving ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className={labelClass} style={labelStyle}>Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Phone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Agency</label>
                  <input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="Sharma Properties" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Default Commission %</label>
                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="e.g. 2.5" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Notes</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this broker…" className="w-full rounded-[0.5rem] border px-2.5 py-2 text-m-section resize-none outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                {canDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving}
                    className="h-9 px-3 rounded-[0.5rem] border text-m-caption font-bold text-m-body press flex items-center gap-1"
                    style={{ borderColor: "var(--color-danger, #dc2626)", color: "var(--color-danger, #dc2626)" }}
                  >
                    <Trash2 className="size-3" /> Delete
                  </button>
                ) : null}
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
                  style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: saving || !name.trim() ? 0.5 : 1 }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
