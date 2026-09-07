"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Package, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MobileSearchHeader,
  MobileCardGrid,
  MobileFab,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";

export type DepartmentListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  stockLocationName: string | null;
  issueCount: number;
};

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

/**
 * Departments list — operational cost centers in a card grid.
 * Shows code, name, stock room link, and issue count.
 */
export function MobileDepartmentsList({
  items,
  activeCount,
  withStockRoom,
  canManage,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: DepartmentListItem[];
  activeCount: number;
  withStockRoom: number;
  canManage?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const fab = useFabModal();

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((d) => (statusFilter === "ACTIVE" ? d.active : !d.active));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (d) =>
          d.code.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const summaryStats: SummaryStat[] = [
    { label: "Departments", value: String(items.length) },
    { label: "Active", value: String(activeCount) },
    { label: "Stock Rooms", value: String(withStockRoom) },
  ];

  if (items.length === 0) {
    return (
      <>
        <MobileEmptyState
          icon={Building2}
          title="No departments yet"
          hint={canManage ? "Tap + to create your first department" : "Departments will appear here once created."}
        />
        {canManage ? (
          <>
            <MobileFab onClick={fab.toggle} label="Add department" isOpen={fab.isOpen} />
            <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Add Department">
              <DepartmentFormDialog onClose={fab.close} />
            </MobileFabModal>
          </>
        ) : null}
      </>
    );
  }

  return (
    <div>
      <MobileSummaryStrip stats={summaryStats} />

      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search code, name, description…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        filterChips={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className="px-2.5 py-1 text-m-body rounded-full border whitespace-nowrap transition-colors press"
                style={{
                  borderColor: statusFilter === opt.value ? "var(--color-steel)" : "var(--color-line)",
                  backgroundColor: statusFilter === opt.value ? "var(--color-paper-2)" : "transparent",
                  color: statusFilter === opt.value ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  fontWeight: statusFilter === opt.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
        showClear={statusFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); }}
      />

      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || statusFilter !== "ALL" ? "No matching departments" : "No departments"}
          hint={query || statusFilter !== "ALL"
            ? "Try a different search or filter"
            : canManage
              ? "Tap + to add your first department"
              : "Departments will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((d) => (
            <DepartmentCard key={d.id} d={d} />
          ))}
        </MobileCardGrid>
      )}

      {canManage ? (
        <MobileFab onClick={fab.toggle} label="Add department" isOpen={fab.isOpen} />
      ) : null}

      <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Add Department">
        <DepartmentFormDialog onClose={fab.close} />
      </MobileFabModal>
    </div>
  );
}

/* ─── Department card ─── */
function DepartmentCard({ d }: { d: DepartmentListItem }) {
  const hasIssues = d.issueCount > 0;
  const accentColor = d.active ? "var(--color-go)" : "var(--color-ink-300)";

  return (
    <div
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-500)" }}>
            {d.name}
          </p>
          <span
            className="text-m-caption font-bold uppercase shrink-0 font-mono"
            style={{ color: "var(--color-ink-500)" }}
          >
            {d.code}
          </span>
        </div>

        {d.description && (
          <p className="text-m-caption leading-tight line-clamp-2" style={{ color: "var(--color-ink-700)" }}>
            {d.description}
          </p>
        )}

        <div className="mt-auto  flex items-center gap-1.5">
          {d.stockLocationName ? (
            <span className="text-m-caption flex items-center gap-1.5 truncate" style={{ color: "var(--color-ink-700)" }}>
              <Package className="size-2 shrink-0" />
              {d.stockLocationName}
            </span>
          ) : (
            <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              No stock room
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span
            className="text-m-caption font-semibold px-1.5 py-0.5 rounded-[0.25rem]"
            style={{
              backgroundColor: d.active ? "var(--color-go-faint, color-mix(in srgb, var(--color-go) 10%, transparent))" : "var(--color-paper-2)",
              color: d.active ? "var(--color-go)" : "var(--color-ink-500)",
            }}
          >
            {d.active ? "Active" : "Inactive"}
          </span>
          {hasIssues && (
            <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {d.issueCount} issue{d.issueCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add department form (rendered inside MobileFabModal) ─── */
function DepartmentFormDialog({
  onClose,
}: {
  onClose: () => void;
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create department");
      }
      toast.success("Department created");
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
